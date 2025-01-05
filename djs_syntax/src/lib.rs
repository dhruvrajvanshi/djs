#[derive(Debug, Copy, Clone)]
pub struct Span {
    pub start: u32,
    pub end: u32,
}
impl Span {
    pub fn start(&self) -> usize {
        self.start as usize
    }
    pub fn end(&self) -> usize {
        self.end as usize
    }
}
