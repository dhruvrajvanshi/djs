import { expect, test } from 'vitest'
import { build_function } from './func.js'
import { interpret } from './interpreter.js'

test('interpreter', () => {
  const func = build_function('@sum_numbers_up_to_9', {}, (ctx) => {
    const { operand: o, emit: i } = ctx
    const state = i.make_object('%state')
    i.set(state, o.string('sum'), o.number(0))
    i.set(state, o.string('i'), o.number(0))
    i.jump('.loop')

    ctx.add_block('.loop', () => {
      // state.sum += state.i
      // state.i += 1
      // if (i > 10) { goto .loop_end }
      // else { goto .loop }
      const state_sum = i.get('%state_sum', state, o.string('sum'))
      const state_i = i.get('%state_i', state, o.string('i'))
      const new_sum = i.add('%new_sum', state_sum, state_i)
      const new_i = i.add('%new_i', state_i, o.number(1))
      i.set(o.local('%state'), o.string('sum'), new_sum)
      i.set(o.local('%state'), o.string('i'), new_i)
      const should_break = i.strict_eq('%should_break', new_i, o.number(10))
      i.jump_if(should_break, '.loop_end', '.loop')
    })

    ctx.add_block('.loop_end', () => {
      const final_sum = i.get('%final_sum', state, o.string('sum'))
      const result = i.to_value('%result', final_sum)
      i.return(result)
    })
  })
  expect(interpret(func)).toEqual(45)
})
