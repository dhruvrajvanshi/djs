import { expect, test } from 'vitest'
import { build_function } from './il_nodes.js'
import { pretty_print } from './pretty_print.js'

test('builder and pretty printer', async () => {
  await expect(
    pretty_print(
      build_function('@test', [], (b) => {
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
