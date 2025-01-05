#[derive(Debug, Copy, Clone)]
pub struct Span {
    pub start: u32,
    pub end: u32,
}
impl Span {
    pub fn between(start: Span, end: Span) -> Span {
        Span {
            start: start.start,
            end: end.end,
        }
    }
    pub fn start(&self) -> usize {
        self.start as usize
    }
    pub fn end(&self) -> usize {
        self.end as usize
    }
}
