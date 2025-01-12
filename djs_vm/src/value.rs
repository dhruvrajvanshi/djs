use std::collections::HashMap;

#[derive(Clone)]
pub enum Value {
    Null,
    Undefined,
    Bool(bool),
    Number(f64),
    Object(*mut Object),
}

pub struct Object {
    pub prototype: *mut Object,
    pub properties: HashMap<String, PropertyDescriptor>,
    pub kind: ObjectKind,
}
pub enum ObjectKind {
    Ordinary,
    String(String),
}

pub enum PropertyDescriptor {
    Value(Value),
}
