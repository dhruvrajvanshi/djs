import { expect, test } from 'vitest'
import {
  buildFunction as build_function,
  op,
  prettyPrint as pretty_print,
} from './index'

test('buildF', async () => {
  await expect(
    pretty_print(
      build_function('@test', [], (b) => {
        b.emit_make_object('%obj')
        b.emit_set(b.local('%obj'), b.string('key'), b.string('value'))
        b.emit_get('%value', op.local('%obj'), op.string('key'))
        b.emit_call('%capitalized', b.global('@builtin.capitalize'), [
          b.local('%value'),
        ]),
          b.emit_return(b.local('%capitalized'))
      }),
    ),
  ).toMatchFileSnapshot('test_snapshots/build_function.dil')
})
