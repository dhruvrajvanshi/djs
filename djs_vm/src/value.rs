use std::collections::HashMap;

#[derive(Clone)]
pub enum Value {
    Null,
    Undefined,
    Bool(bool),
    Number(f64),
    Object(*mut Object),
}

pub enum Object {
    Instance(ObjectInstance),
    String(String),
}
pub struct ObjectInstance {
    pub prototype: *mut Object,
    pub properties: HashMap<String, PropertyDescriptor>,
}
pub enum PropertyDescriptor {
    Value(Value),
}
