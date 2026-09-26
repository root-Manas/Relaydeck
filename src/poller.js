function createPoller({ store, fetchItems, matches, deliver }) {
  const inFlight = new Set();
  const compactError = error => String(error?.message || error).slice(0, 240);

  async function pollSource(source) {
    if (inFlight.has(source.id)) return { busy: true };
    inFlight.add(source.id);
    let delivered = 0; let filtered = 0; let seeded = 0;
    try {
      const items = await fetchItems(source);
      if (!source.initialized) {
        for (const item of items) { store.record(source.id, item, 'seeded'); seeded++; }
        store.markChecked(source.id, null, true);
        return { seeded, delivered: 0, filtered: 0 };
      }
      const unseen = items.filter(item => {
        const previous = store.entry(source.id, item.id);
        return !previous || previous.status === 'failed';
      }).slice(0, 10).reverse();
      for (const item of unseen) {
        if (!matches(item, source)) { store.record(source.id, item, 'filtered'); filtered++; continue; }
        try {
          await deliver(item, source);
          store.record(source.id, item, 'delivered'); delivered++;
        } catch (error) {
          store.record(source.id, item, 'failed', compactError(error));
          throw error;
        }
      }
      store.markChecked(source.id);
      return { seeded, delivered, filtered };
    } catch (error) {
      store.markChecked(source.id, compactError(error));
      throw error;
    } finally { inFlight.delete(source.id); }
  }
  return { pollSource };
}

module.exports = { createPoller };
