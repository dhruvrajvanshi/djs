console.log(await Promise.resolve(3).finally(() => Promise.resolve(4)));
try { await Promise.reject("original").finally(() => 5); } catch (e) { console.log(e); }
try { await Promise.resolve(3).finally(() => { throw "cleanup"; }); } catch (e) { console.log(e); }
console.log(await Promise.resolve(6).finally(null));
