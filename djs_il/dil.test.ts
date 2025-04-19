import { expect, test } from 'vitest'
import { build_function } from './il.js'
import { pretty_print } from './pretty_print.js'

test('builder and pretty printer', async () => {
  await expect(
    pretty_print(
      build_function('@test', (b, i) => {
        i.make_object('%obj')
        i.set(b.local('%obj'), b.string('key'), b.string('value'))
        i.get('%value', b.local('%obj'), b.string('key'))
        i.jump_if(b.local('%value'), '.if_true', '.if_false')
        b.add_block('.if_true', () => {
          i.call('%capitalized', b.global('@builtin.capitalize'), [
            b.local('%value'),
          ])
          i.return(b.local('%capitalized'))
        })
        b.add_block('.if_false', () => {
          i.return(b.string('default'))
        })
      }),
    ),
  ).toMatchFileSnapshot('test_snapshots/build_function.dil')
})

const fib = build_function('@fib', (b, i) => {
  b.add_param('$0', b.js_value)
  i.strict_eq('%is_zero', b.number(0), b.param('$0'))
  i.strict_eq('%is_one', b.number(1), b.param('$0'))
  i.or('%should_ret_zero', b.local('%is_zero'), b.local('%is_one'))
  i.jump_if(b.local('%should_ret_zero'), '.ret_zero', '.recur')
  b.add_block('.ret_zero', () => {
    i.return(b.number(0))
  })
  b.add_block('.recur', () => {
    i.sub('%n_minus_1', b.param('$0'), b.number(1))
    i.sub('%n_minus_2', b.param('$0'), b.number(2))
    i.call('%fib_minus_1', b.global('@fib'), [b.local('%n_minus_1')])
    i.call('%fib_minus_2', b.global('@fib'), [b.local('%n_minus_2')])
    i.add('%result', b.local('%fib_minus_1'), b.local('%fib_minus_2'))
    i.return(b.local('%result'))
  })
})
test('pretty print fibonacci', async () =>
  await expect(pretty_print(fib)).toMatchFileSnapshot('test_snapshots/fib.dil'))
