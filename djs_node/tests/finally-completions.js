function one() { try { return 1; } finally { console.log("one"); } }
function two() { try { return 2; } finally { return 3; } }
function three() { try { throw 4; } finally { return 5; } }
function four() { try { return 6; } finally { throw 7; } }
console.log(one(), two(), three());
try { four(); } catch (e) { console.log(e); }
try { missing(); } catch (e) { console.log(e.name, e instanceof Error); }
console.log(false && missing(), true || missing(), true || false && missing());
