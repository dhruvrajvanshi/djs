import { expect, test } from 'vitest'
import { build_function } from './il.js'
import { pretty_print } from './pretty_print.js'

test('builder and pretty printer', async () => {
  await expect(
    pretty_print(
      build_function('@test', (b) => {
        b.emit_make_object('%obj')
        b.emit_set(b.local('%obj'), b.string('key'), b.string('value'))
        b.emit_get('%value', b.local('%obj'), b.string('key'))
        b.emit_jump_if(b.local('%value'), '.if_true', '.if_false')
        b.add_block('.if_true', () => {
          b.emit_call('%capitalized', b.global('@builtin.capitalize'), [
            b.local('%value'),
          ])
          b.emit_return(b.local('%capitalized'))
        })
        b.add_block('.if_false', () => {
          b.emit_return(b.string('default'))
        })
      }),
    ),
  ).toMatchFileSnapshot('test_snapshots/build_function.dil')
})

const fib = build_function('@fib', (b) => {
  b.add_param('$0', b.js_value)
  b.emit_strict_eq('%is_zero', b.number(0), b.param('$0'))
  b.emit_strict_eq('%is_one', b.number(1), b.param('$0'))
  b.emit_or('%should_ret_zero', b.local('%is_zero'), b.local('%is_one'))
  b.emit_jump_if(b.local('%should_ret_zero'), '.ret_zero', '.recur')
  b.add_block('.ret_zero', () => {
    b.emit_return(b.number(0))
  })
  b.add_block('.recur', () => {
    b.emit_sub('%n_minus_1', b.param('$0'), b.number(1))
    b.emit_sub('%n_minus_2', b.param('$0'), b.number(2))
    b.emit_call('%fib_minus_1', b.global('@fib'), [b.local('%n_minus_1')])
    b.emit_call('%fib_minus_2', b.global('@fib'), [b.local('%n_minus_2')])
    b.emit_add('%result', b.local('%fib_minus_1'), b.local('%fib_minus_2'))
    b.emit_return(b.local('%result'))
  })
})
test('pretty print fibonacci', async () =>
  await expect(pretty_print(fib)).toMatchFileSnapshot('test_snapshots/fib.dil'))
