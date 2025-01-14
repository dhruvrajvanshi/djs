use crate::value::Value;

#[derive(Debug, Clone, Copy)]
pub enum Bytecode {
    LoadConst(Value),
    Return,
    Call,
}
