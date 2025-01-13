use std::{collections::HashMap, ptr::NonNull};

use crate::bytecode::Bytecode;

#[derive(Debug, Clone, Copy)]
pub enum Value {
    Null,
    Undefined,
    Bool(bool),
    Number(f64),
    Object(NonNull<Object>),
}

#[derive(Debug)]
pub struct Object {
    pub prototype: *mut Object,
    pub properties: HashMap<String, PropertyDescriptor>,
    pub kind: ObjectKind,
}

#[derive(Debug)]
pub enum ObjectKind {
    Ordinary,
    String(String),
    Function(Function),
}

#[derive(Debug)]
pub enum PropertyDescriptor {
    Value(Value),
}

#[derive(Debug)]
pub struct Function {
    pub code: Vec<Bytecode>,
}
