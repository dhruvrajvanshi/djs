try { Promise(function() {}); } catch (e) { console.log(e.name, e instanceof TypeError); }
try { new Promise(1); } catch (e) { console.log(e.name); }
try { new Promise.resolve(1); } catch (e) { console.log(e.name); }
const then = Promise.prototype.then;
try { then(); } catch (e) { console.log(e.name); }
new Promise(() => { throw { reason: 42 }; }).catch(e => console.log(e.reason));
new Promise(class Executor {}).catch(e => console.log(e.name));
