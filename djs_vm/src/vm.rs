use crate::{
    bytecode::Bytecode,
    value::{Function, ObjectKind, Value},
};

pub struct VM;
struct CallFrame<'a> {
    return_address: Option<usize>,
    function: &'a Function,
}

impl VM {
    pub fn new() -> Self {
        VM
    }

    pub fn run(&mut self, code: &[Bytecode]) -> Value {
        let mut ip = 0;
        let mut stack: Vec<Value> = Vec::with_capacity(1024);
        let mut call_stack: Vec<CallFrame> = Vec::with_capacity(1024);
        let function = Function {
            code: code.to_vec(),
        };
        call_stack.push(CallFrame {
            return_address: None,
            function: &function,
        });
        loop {
            let instruction = call_stack.last().unwrap().function.code[ip];
            use Bytecode::*;
            match instruction {
                LoadConst(value) => {
                    stack.push(value);
                    ip += 1;
                }
                Return => {
                    let result = call_stack.pop();
                    match result {
                        Some(CallFrame {
                            return_address: Some(return_address),
                            ..
                        }) => {
                            ip = return_address;
                        }
                        Some(CallFrame {
                            return_address: None,
                            ..
                        })
                        | None => {
                            return stack.pop().expect("Stack underflow");
                        }
                    }
                }
                Call => {
                    let function = stack.pop().expect("Stack underflow");
                    match function {
                        Value::Object(obj) => {
                            let obj = unsafe { &*obj.as_ptr() };
                            let func = match &obj.kind {
                                ObjectKind::Function(f) => f,
                                k => panic!("Expected a function object; Found {k:?}"),
                            };

                            call_stack.push(CallFrame {
                                return_address: Some(ip + 1),
                                function: func,
                            });
                            ip = 0;
                        }
                        value => panic!("Expected a function object; Found {value:?}"),
                    }
                }
            }
        }
    }
}

impl Default for VM {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod test {
    use core::f64;
    use std::ptr::{self, NonNull};

    use crate::value::{Function, Object, ObjectKind, Value};

    use super::VM;

    #[test]
    fn test_return_pi() {
        let mut vm = VM::new();

        use crate::bytecode::Bytecode as B;
        let value = vm.run(&[B::LoadConst(Value::Number(f64::consts::PI)), B::Return]);
        assert!(matches!(value, Value::Number(f64::consts::PI)));
    }

    #[test]
    fn test_function_calls() {
        let mut vm = VM::new();
        use crate::bytecode::Bytecode::*;
        let mut f2 = Object {
            prototype: std::ptr::null_mut(),
            properties: Default::default(),
            kind: ObjectKind::Function(Function {
                code: vec![LoadConst(Value::Number(2.0)), Return],
            }),
        };
        let f2 = Value::Object(NonNull::new(ptr::from_mut(&mut f2)).unwrap());
        let value = vm.run(&[LoadConst(f2), Call, Return]);
        assert!(matches!(value, Value::Number(2.0)));
    }
}
