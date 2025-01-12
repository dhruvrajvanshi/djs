use crate::value::Value;

pub type Register = u8;
pub const REG_RETURN: Register = 0;

#[derive(Debug, Clone, Copy)]
pub enum Bytecode {
    LoadConst(Register, Value),
    Return,
}
