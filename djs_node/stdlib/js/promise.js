// 27.2 Promise Objects
import {
  well_known,
  slot,
  internal_method,
  attributes,
  abstract_operation,
  host_enqueue_promise_job,
  call,
  has_slot,
  get_slot,
  set_slot,
  ordinary_object_create,
  create_builtin_function,
} from "djs:native"
import { get_prototype_from_constructor } from "djs:abstract"
import { is_object } from "./support.js"
import { ObjectPrototype, FunctionPrototype } from "./fundamental.js"

// 27.2.3 The Promise Constructor
const Promise = well_known("%Promise%", create_builtin_function, {
  [slot("[[Prototype]]")]: FunctionPrototype,

  // 27.2.3.1 Promise ( executor )
  [internal_method("[[Call]]", "[[Construct]]")]: function Promise(executor) {
    if (new.target === undefined)
      throw new TypeError("Promise constructor requires new")
    if (typeof executor !== "function")
      throw new TypeError("Promise executor is not callable")
    const promise = ordinary_object_create(
      get_prototype_from_constructor(new.target, PromisePrototype),
      [
        "[[PromiseState]]",
        "[[PromiseResult]]",
        "[[PromiseFulfillReactions]]",
        "[[PromiseRejectReactions]]",
        "[[PromiseIsHandled]]",
      ],
    )
    set_slot(promise, "[[PromiseState]]", "pending")
    set_slot(promise, "[[PromiseIsHandled]]", false)
    const functions = create_resolving_functions(promise)
    try {
      call(executor, undefined, functions.resolve, functions.reject)
    } catch (error) {
      call(functions.reject, undefined, error)
    }
    return promise
  },

  // 27.2.4 Properties of the Promise Constructor
  prototype: attributes(
    { writable: false, configurable: false },
    PromisePrototype,
  ),

  // 27.2.4.6 Promise.reject ( r )
  reject(reason) {
    const result = new_promise_capability(this)
    call(result.reject, undefined, reason)
    return result.promise
  },

  // 27.2.4.8 Promise.resolve ( x )
  resolve(value) {
    if (!is_object(this))
      throw new TypeError("Promise.resolve requires an object receiver")
    return promise_resolve(this, value)
  },

  // 27.2.4.9 Promise.withResolvers ( )
  withResolvers() {
    return new_promise_capability(this)
  },
})

// 27.2.5 Properties of the Promise Prototype Object
const PromisePrototype = well_known(
  "%Promise.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ObjectPrototype,
    constructor: Promise,

    // 27.2.5.1 Promise.prototype.catch ( onRejected )
    catch(rejected) {
      return this.then(undefined, rejected)
    },

    // 27.2.5.3 Promise.prototype.finally ( onFinally )
    finally(onFinally) {
      if (typeof onFinally !== "function")
        return this.then(onFinally, onFinally)
      return this.then(
        function (value) {
          const result = call(onFinally, undefined)
          return promise_resolve(Promise, result).then(function () {
            return value
          })
        },
        function (reason) {
          const result = call(onFinally, undefined)
          return promise_resolve(Promise, result).then(function () {
            throw reason
          })
        },
      )
    },

    // 27.2.5.4 Promise.prototype.then ( onFulfilled, onRejected )
    then(fulfilled, rejected) {
      if (!is_promise(this))
        throw new TypeError("Promise.prototype.then requires a promise")
      const result = new_promise_capability(Promise)
      perform_promise_then(this, fulfilled, rejected, result)
      return result.promise
    },
  },
)

// 27.2.1.3 CreateResolvingFunctions ( promise )
function create_resolving_functions(promise) {
  // Shared [[AlreadyResolved]]; it also locks both functions during adoption.
  let already_resolved = false
  // 27.2.1.3.2 Promise Resolve Functions
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
    // 27.2.2.2 NewPromiseResolveThenableJob ( promiseToResolve, thenable, then )
    host_enqueue_promise_job(function () {
      const functions = create_resolving_functions(promise)
      try {
        call(then, resolution, functions.resolve, functions.reject)
      } catch (error) {
        call(functions.reject, undefined, error)
      }
    })
  }
  // 27.2.1.3.1 Promise Reject Functions
  const reject = function (reason) {
    if (already_resolved) return
    already_resolved = true
    reject_promise(promise, reason)
  }
  return { resolve, reject }
}

// 27.2.1.4 FulfillPromise ( promise, value )
function fulfill_promise(promise, value) {
  const reactions = get_slot(promise, "[[PromiseFulfillReactions]]")
  settle_promise(promise, "fulfilled", value)
  trigger_promise_reactions(reactions, value)
}

// 27.2.1.7 RejectPromise ( promise, reason )
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

// 27.2.1.8 TriggerPromiseReactions ( reactions, argument )
function trigger_promise_reactions(last, argument) {
  if (last === undefined) return
  let reaction = last
  while (true) {
    reaction = reaction.next
    new_promise_reaction_job(reaction, argument)
    if (reaction === last) return
  }
}

// 27.2.1.2 PromiseReaction Records
function promise_reaction(capability, type, handler) {
  return {
    capability,
    type,
    handler: typeof handler === "function" ? handler : undefined,
    next: undefined,
  }
}

// A reaction list is a circular list through each reaction's `next`, held by
// its last reaction. Appending is O(1) and doesn't go through Array.prototype,
// which a program can change.
function append_reaction(last, reaction) {
  if (last === undefined) reaction.next = reaction
  else {
    reaction.next = last.next
    last.next = reaction
  }
  return reaction
}

// 27.2.1.6 IsPromise ( x )
function is_promise(value) {
  return is_object(value) && has_slot(value, "[[PromiseState]]")
}

// 27.2.1.5 NewPromiseCapability ( C )
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

// The VM only creates %Promise% capabilities, for async function calls.
function new_intrinsic_promise_capability() {
  return new_promise_capability(Promise)
}
abstract_operation("NewPromiseCapability", new_intrinsic_promise_capability)

// 27.2.2.1 NewPromiseReactionJob ( reaction, argument )
function new_promise_reaction_job(reaction, argument) {
  host_enqueue_promise_job(function () {
    const capability = reaction.capability
    let result
    try {
      if (reaction.handler === undefined) {
        if (reaction.type === "reject") throw argument
        result = argument
      } else result = call(reaction.handler, undefined, argument)
    } catch (error) {
      if (capability === undefined) throw error
      call(capability.reject, undefined, error)
      return
    }
    if (capability !== undefined) call(capability.resolve, undefined, result)
  })
}

// 27.2.4.7.1 PromiseResolve ( C, x )
function promise_resolve(Constructor, value) {
  if (is_promise(value) && value.constructor === Constructor) return value
  const result = new_promise_capability(Constructor)
  call(result.resolve, undefined, value)
  return result.promise
}

// 27.2.5.4.1 PerformPromiseThen ( promise, onFulfilled, onRejected [ , resultCapability ] )
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

// 27.7.5.3 Await ( value ), resuming through the VM's callbacks
function await_value(value, on_fulfilled, on_rejected) {
  perform_promise_then(
    promise_resolve(Promise, value),
    on_fulfilled,
    on_rejected,
    undefined,
  )
}
abstract_operation("Await", await_value)

export default Promise
