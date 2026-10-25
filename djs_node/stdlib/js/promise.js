import { abstract_operation, host_enqueue_promise_job, call } from "djs:native"

let await_internal

class Promise {
  #state = 0
  #result
  #head
  #tail
  #handled = false

  constructor(executor) {
    if (typeof executor !== "function")
      throw new TypeError("Promise executor is not callable")
    const functions = Promise.#resolving(this)
    try {
      call(executor, undefined, functions.resolve, functions.reject)
    } catch (error) {
      call(functions.reject, undefined, error)
    }
  }

  static #isPromise(value) {
    if (value === null) return false
    if (typeof value === "object") return #state in value
    if (typeof value === "function") return #state in value
    return false
  }

  static #resolving(target) {
    // Clearing this shared cell locks both functions, including during adoption.
    let promise = target
    return {
      resolve: function (value) {
        if (promise === undefined) return
        const current = promise
        promise = undefined
        if (value === current) {
          Promise.#settle(
            current,
            new TypeError("Promise cannot resolve itself"),
            2,
          )
          return
        }
        let then
        if (value !== null) {
          if (typeof value === "object" || typeof value === "function") {
            try {
              then = value.then
            } catch (error) {
              Promise.#settle(current, error, 2)
              return
            }
          }
        }
        if (typeof then !== "function") {
          Promise.#settle(current, value, 1)
          return
        }
        host_enqueue_promise_job(function () {
          const functions = Promise.#resolving(current)
          try {
            call(then, value, functions.resolve, functions.reject)
          } catch (error) {
            call(functions.reject, undefined, error)
          }
        })
      },
      reject: function (reason) {
        if (promise === undefined) return
        const current = promise
        promise = undefined
        Promise.#settle(current, reason, 2)
      },
    }
  }

  static #settle(promise, value, state) {
    if (promise.#state !== 0) return
    let reaction = promise.#head
    promise.#state = state
    promise.#result = value
    promise.#head = undefined
    promise.#tail = undefined
    while (reaction !== undefined) {
      Promise.#enqueue(reaction, value, state)
      reaction = reaction.next
    }
  }

  static #enqueue(reaction, value, state) {
    host_enqueue_promise_job(function () {
      const handler = state === 1 ? reaction.fulfilled : reaction.rejected
      const resultCapability = reaction.capability
      let result
      try {
        if (typeof handler === "function")
          result = call(handler, undefined, value)
        else {
          if (state === 2) throw value
          result = value
        }
      } catch (error) {
        if (resultCapability === undefined) throw error
        call(resultCapability.reject, undefined, error)
        return
      }
      if (resultCapability !== undefined)
        call(resultCapability.resolve, undefined, result)
    })
  }

  static #performThen(promise, fulfilled, rejected, resultCapability) {
    const state = promise.#state
    const reaction = {
      fulfilled,
      rejected,
      capability: resultCapability,
      next: undefined,
    }
    promise.#handled = true
    if (state === 0) {
      if (promise.#tail === undefined) promise.#head = reaction
      else promise.#tail.next = reaction
      promise.#tail = reaction
    } else Promise.#enqueue(reaction, promise.#result, state)
  }

  static #resolve(Constructor, value) {
    if (Constructor === null)
      throw new TypeError("Promise.resolve requires an object receiver")
    if (typeof Constructor !== "object" && typeof Constructor !== "function")
      throw new TypeError("Promise.resolve requires an object receiver")
    if (Promise.#isPromise(value)) {
      if (value.constructor === Constructor) return value
    }
    const result = capability(Constructor)
    call(result.resolve, undefined, value)
    return result.promise
  }

  // Await uses captured internal operations, independent of public methods.
  static #await = (await_internal = function (value, fulfilled, rejected) {
    const promise = Promise.#resolve(Promise, value)
    Promise.#performThen(promise, fulfilled, rejected, undefined)
  })

  then(fulfilled, rejected) {
    const state = this.#state
    const result = capability(Promise)
    Promise.#performThen(this, fulfilled, rejected, result)
    return result.promise
  }

  catch(rejected) {
    return this.then(undefined, rejected)
  }

  finally(onFinally) {
    if (typeof onFinally !== "function") return this.then(onFinally, onFinally)
    return this.then(
      function (value) {
        const result = call(onFinally, undefined)
        return Promise.#resolve(Promise, result).then(function () {
          return value
        })
      },
      function (reason) {
        const result = call(onFinally, undefined)
        return Promise.#resolve(Promise, result).then(function () {
          throw reason
        })
      },
    )
  }

  static resolve(value) {
    return Promise.#resolve(this, value)
  }
  static reject(reason) {
    const result = capability(this)
    call(result.reject, undefined, reason)
    return result.promise
  }
  static withResolvers() {
    return capability(this)
  }
}

// 6.2.4.1 Await ( value ), resuming through the VM's callbacks
function await_value(value, on_fulfilled, on_rejected) {
  await_internal(value, on_fulfilled, on_rejected)
}
abstract_operation("Await", await_value)

// 27.2.1.5 NewPromiseCapability ( C ), for %Promise%
function new_promise_capability() {
  return capability(Promise)
}
abstract_operation("NewPromiseCapability", new_promise_capability)

function capability(Constructor) {
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
export default Promise
