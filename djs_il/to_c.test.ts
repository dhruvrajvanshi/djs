import { test, expect } from 'vitest'
import { build_function } from './il.js'
import { to_c } from './to_c.js'

test('generated_c_output_fib', async () => {
  await expect(to_c(fib)).toMatchFileSnapshot(
    'test_snapshots/generated_c_output_fib.c',
  )
})

const fib = build_function('@fib', {}, (ctx) => {
  const { emit: i, type: t, operand: o, ...b } = ctx
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
