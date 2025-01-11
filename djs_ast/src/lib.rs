// Since this file is auto generated, we turn off the unused_variables lint to avoid"
// having to add special cases for generated pattern names which are unused."
#![allow(unused_variables)]
mod ast {
    include!(concat!(env!("OUT_DIR"), "/ast.rs"));
}
pub mod visitor {

    include!(concat!(env!("OUT_DIR"), "/visitor.rs"));
}

pub use ast::*;
