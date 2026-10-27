import {
  call,
  create_builtin_function,
  define_own_property,
  has_slot,
  get_slot,
  object_create,
  set_slot,
  set_abstract_operation,
  well_known_intrinsic_objects,
} from "djs:vm"
import { enqueue_job } from "djs:runtime"
import { define_builtin_properties } from "./define_builtin_properties.js"
import { get_prototype_from_constructor } from "./abstract-operations.js"

const { "%Object.prototype%": object_prototype } = well_known_intrinsic_objects

function is_object(value) {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  )
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-constructor
 */
const Promise = create_builtin_function(
  function (executor) {
    if (new.target === undefined)
      throw new TypeError("Promise constructor requires new")
    if (typeof executor !== "function")
      throw new TypeError("Promise executor is not callable")
    const promise = object_create(
      get_prototype_from_constructor(new.target, PromisePrototype),
      "ordinary",
      {
        "[[PromiseState]]": "pending",
        "[[PromiseResult]]": undefined,
        "[[PromiseFulfillReactions]]": undefined,
        "[[PromiseRejectReactions]]": undefined,
        "[[PromiseIsHandled]]": false,
      },
    )
    const functions = create_resolving_functions(promise)
    try {
      call(executor, undefined, [functions.resolve, functions.reject])
    } catch (error) {
      call(functions.reject, undefined, [error])
    }
    return promise
  },
  { name: "Promise", constructor: true },
)

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-properties-of-the-promise-prototype-object
 */
const PromisePrototype = object_create(object_prototype, "ordinary")

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-properties-of-the-promise-constructor
 */
define_own_property(Promise, "prototype", {
  value: PromisePrototype,
  writable: false,
  enumerable: false,
  configurable: false,
})
define_builtin_properties(Promise, {
  reject(reason) {
    const result = new_promise_capability(this)
    call(result.reject, undefined, [reason])
    return result.promise
  },

  resolve(value) {
    if (!is_object(this))
      throw new TypeError("Promise.resolve requires an object receiver")
    return promise_resolve(this, value)
  },

  withResolvers() {
    return new_promise_capability(this)
  },
})

define_builtin_properties(PromisePrototype, {
  constructor: Promise,

  catch(rejected) {
    return this.then(undefined, rejected)
  },

  finally(onFinally) {
    if (typeof onFinally !== "function") return this.then(onFinally, onFinally)
    return this.then(
      function (value) {
        const result = call(onFinally, undefined, [])
        return promise_resolve(Promise, result).then(function () {
          return value
        })
      },
      function (reason) {
        const result = call(onFinally, undefined, [])
        return promise_resolve(Promise, result).then(function () {
          throw reason
        })
      },
    )
  },

  then(fulfilled, rejected) {
    if (!is_promise(this))
      throw new TypeError("Promise.prototype.then requires a promise")
    const result = new_promise_capability(Promise)
    perform_promise_then(this, fulfilled, rejected, result)
    return result.promise
  },
})

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-createresolvingfunctions
 */
function create_resolving_functions(promise) {
  // The spec's [[AlreadyResolved]], shared by both functions: once either one
  // runs, later calls to either do nothing.
  let already_resolved = false
  const resolve = function (resolution) {
    if (already_resolved) return
    already_resolved = true
    if (resolution === promise) {
      reject_promise(promise, new TypeError("Promise cannot resolve itself"))
      return
    }
    if (!is_object(resolution)) {
      fulfill_promise(promise, resolution)
      return
    }
    let then
    try {
      then = resolution.then
    } catch (error) {
      reject_promise(promise, error)
      return
    }
    if (typeof then !== "function") {
      fulfill_promise(promise, resolution)
      return
    }
    // https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-newpromiseresolvethenablejob
    enqueue_job(function () {
      const functions = create_resolving_functions(promise)
      try {
        call(then, resolution, [functions.resolve, functions.reject])
      } catch (error) {
        call(functions.reject, undefined, [error])
      }
    })
  }
  const reject = function (reason) {
    if (already_resolved) return
    already_resolved = true
    reject_promise(promise, reason)
  }
  return { resolve, reject }
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-fulfillpromise
 */
function fulfill_promise(promise, value) {
  const reactions = get_slot(promise, "[[PromiseFulfillReactions]]")
  settle_promise(promise, "fulfilled", value)
  trigger_promise_reactions(reactions, value)
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-rejectpromise
 */
function reject_promise(promise, reason) {
  const reactions = get_slot(promise, "[[PromiseRejectReactions]]")
  settle_promise(promise, "rejected", reason)
  trigger_promise_reactions(reactions, reason)
}

function settle_promise(promise, state, value) {
  set_slot(promise, "[[PromiseResult]]", value)
  set_slot(promise, "[[PromiseFulfillReactions]]", undefined)
  set_slot(promise, "[[PromiseRejectReactions]]", undefined)
  set_slot(promise, "[[PromiseState]]", state)
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-triggerpromisereactions
 */
function trigger_promise_reactions(last, argument) {
  if (last === undefined) return
  let reaction = last
  while (true) {
    reaction = reaction.next
    new_promise_reaction_job(reaction, argument)
    if (reaction === last) return
  }
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promisereaction-records
 */
function promise_reaction(capability, type, handler) {
  return {
    capability,
    type,
    handler: typeof handler === "function" ? handler : undefined,
    next: undefined,
  }
}

// A promise keeps its reactions in a circular linked list. The slot holds the
// last reaction, and each reaction's `next` points to the one after it,
// wrapping around to the first, so appending takes constant time.
function append_reaction(last, reaction) {
  if (last === undefined) reaction.next = reaction
  else {
    reaction.next = last.next
    last.next = reaction
  }
  return reaction
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-ispromise
 */
function is_promise(value) {
  return is_object(value) && has_slot(value, "[[PromiseState]]")
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-newpromisecapability
 */
function new_promise_capability(Constructor) {
  let resolve
  let reject
  const promise = new Constructor(function (onResolve, onReject) {
    if (resolve !== undefined)
      throw new TypeError("Promise executor called twice")
    if (reject !== undefined)
      throw new TypeError("Promise executor called twice")
    resolve = onResolve
    reject = onReject
  })
  if (typeof resolve !== "function")
    throw new TypeError("Invalid promise resolve function")
  if (typeof reject !== "function")
    throw new TypeError("Invalid promise reject function")
  return { promise, resolve, reject }
}

function new_intrinsic_promise_capability() {
  return new_promise_capability(Promise)
}

// The VM calls this when it implicitly creates a promise.
// @example
// ```js
//   async function f() {}
//   f() // returns NewPromiseCapability().promise
// ```
// Module imports call this.
set_abstract_operation("NewPromiseCapability", new_intrinsic_promise_capability)

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-newpromisereactionjob
 */
function new_promise_reaction_job(reaction, argument) {
  enqueue_job(function () {
    const capability = reaction.capability
    let result
    try {
      if (reaction.handler === undefined) {
        if (reaction.type === "reject") throw argument
        result = argument
      } else result = call(reaction.handler, undefined, [argument])
    } catch (error) {
      if (capability === undefined) throw error
      call(capability.reject, undefined, [error])
      return
    }
    if (capability !== undefined) call(capability.resolve, undefined, [result])
  })
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-resolve
 */
function promise_resolve(Constructor, value) {
  if (is_promise(value) && value.constructor === Constructor) return value
  const result = new_promise_capability(Constructor)
  call(result.resolve, undefined, [value])
  return result.promise
}

/**
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-performpromisethen
 */
function perform_promise_then(promise, fulfilled, rejected, capability) {
  const state = get_slot(promise, "[[PromiseState]]")
  if (state === "pending") {
    set_slot(
      promise,
      "[[PromiseFulfillReactions]]",
      append_reaction(
        get_slot(promise, "[[PromiseFulfillReactions]]"),
        promise_reaction(capability, "fulfill", fulfilled),
      ),
    )
    set_slot(
      promise,
      "[[PromiseRejectReactions]]",
      append_reaction(
        get_slot(promise, "[[PromiseRejectReactions]]"),
        promise_reaction(capability, "reject", rejected),
      ),
    )
  } else
    new_promise_reaction_job(
      state === "fulfilled"
        ? promise_reaction(capability, "fulfill", fulfilled)
        : promise_reaction(capability, "reject", rejected),
      get_slot(promise, "[[PromiseResult]]"),
    )
  set_slot(promise, "[[PromiseIsHandled]]", true)
}

/**
 * The VM passes the callbacks that resume the awaiting code.
 * https://tc39.es/ecma262/multipage/control-abstraction-objects.html#await
 */
function await_value(value, on_fulfilled, on_rejected) {
  perform_promise_then(
    promise_resolve(Promise, value),
    on_fulfilled,
    on_rejected,
    undefined,
  )
}
// The VM calls this for each `await`, including top-level await:
//
//   const result = await value
//   // await_value(value, resume with result, resume by throwing the reason)
set_abstract_operation("Await", await_value)

export default Promise
