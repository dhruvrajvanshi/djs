use std::ops::{Index, IndexMut};

use crate::{
    bytecode::{Bytecode, Register, REG_RETURN},
    value::Value,
};

pub struct VM {
    registers: Registers,
}

struct Registers([Value; 256]);
impl Index<Register> for Registers {
    type Output = Value;

    fn index(&self, index: Register) -> &Self::Output {
        &self.0[index as usize]
    }
}
impl IndexMut<Register> for Registers {
    fn index_mut(&mut self, index: Register) -> &mut Self::Output {
        &mut self.0[index as usize]
    }
}

impl VM {
    pub fn new() -> Self {
        VM {
            registers: Registers([Value::Undefined; 256]),
        }
    }

    pub fn call(&mut self, f: &Function) -> Value {
        let mut ip = 0;
        loop {
            let instruction = f.code[ip];
            use Bytecode::*;
            match instruction {
                LoadConst(reg, value) => {
                    self.registers[reg] = value;
                    ip += 1;
                }
                Return => return self.registers[REG_RETURN],
            }
        }
    }
}

impl Default for VM {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct Function {
    pub code: Vec<Bytecode>,
}

#[cfg(test)]
mod test {
    use core::f64;

    use crate::{bytecode::REG_RETURN, value::Value, vm::Function};

    use super::VM;

    #[test]
    fn test_return_pi() {
        let mut vm = VM::new();

        use crate::bytecode::Bytecode as B;
        let value = vm.call(&Function {
            code: vec![
                B::LoadConst(REG_RETURN, Value::Number(f64::consts::PI)),
                B::Return,
            ],
        });
        assert!(matches!(value, Value::Number(f64::consts::PI)));
    }
}
