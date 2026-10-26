function assert(condition, message) {
  if (!condition) {
    throw new AssertionError(message)
  }
}
class AssertionError extends Error {}
export default assert
