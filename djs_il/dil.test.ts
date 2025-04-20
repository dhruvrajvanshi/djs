import { expect, test } from 'vitest'
import { build_function } from './il.js'
import { pretty_print } from './pretty_print.js'

test('builder and pretty printer', async () => {
  await expect(
    pretty_print(
      build_function('@test', {}, (ctx) => {
        const { emit: i, operand: o, type: t, ...b } = ctx
        b.declare_global(
          '@builtin.capitalize',
          t.unboxed_func(t.value, t.value),
        )
        i.make_object('%obj')
        i.set(o.local('%obj'), o.string('key'), o.string('value'))
        i.get('%value', o.local('%obj'), o.string('key'))
        i.jump_if(o.local('%value'), '.if_true', '.if_false')
        b.add_block('.if_true', () => {
          i.unboxed_call('%capitalized', o.global('@builtin.capitalize'), [
            o.local('%value'),
          ])
          i.return(o.local('%capitalized'))
        })
        b.add_block('.if_false', () => {
          i.return(o.string('default'))
        })
      }),
    ),
  ).toMatchFileSnapshot('test_snapshots/build_function.dil')
})

const fib = build_function('@fib', {}, (ctx) => {
  const { emit: i, operand: o, type: t, ...b } = ctx
  b.add_param('$0', t.value)
  i.strict_eq('%is_zero', o.number(0), o.param('$0'))
  i.strict_eq('%is_one', o.number(1), o.param('$0'))
  i.or('%should_ret_zero', o.local('%is_zero'), o.local('%is_one'))
  i.jump_if(o.local('%should_ret_zero'), '.ret_zero', '.recur')
  b.add_block('.ret_zero', () => {
    i.return(o.number(0))
  })
  b.add_block('.recur', () => {
    i.sub('%n_minus_1', o.param('$0'), o.number(1))
    i.sub('%n_minus_2', o.param('$0'), o.number(2))
    i.to_value('%v_n_minus_1', o.local('%n_minus_1'))
    i.to_value('%v_n_minus_2', o.local('%n_minus_2'))
    i.unboxed_call('%fib_minus_1', o.global('@fib'), [o.local('%v_n_minus_1')])
    i.unboxed_call('%fib_minus_2', o.global('@fib'), [o.local('%v_n_minus_2')])
    i.add('%result', o.local('%fib_minus_1'), o.local('%fib_minus_2'))
    i.return(o.local('%result'))
  })
})
test('pretty print fibonacci', async () =>
  await expect(pretty_print(fib)).toMatchFileSnapshot('test_snapshots/fib.dil'))
