// What each line of a ticket's trail means, in words. One place, read by the
// pages and by the tests: the fields are the ones `core/` writes.
(function (root) {
  const has = (v) => v !== undefined && v !== null && v !== '';
  const join = (...parts) => parts.filter(has).join(' · ');
  const EVENTS = {
    created: (e) => ['Created', `in ${e.status || 'backlog'}`],
    moved: (e) => ['Moved', join(has(e.to) ? `to ${e.to}${e.forced ? ' (forced)' : ''}` : '', e.why)],
    started: (e) => ['Work started', join(has(e.branch) ? `branch ${e.branch}` : '', has(e.base) ? `from ${e.base}` : '')],
    agent: (e) => [`${e.role || 'agent'} sent`, join(has(e.agent) ? `agent ${e.agent}` : '', has(e.step) ? `step ${e.step}` : '')],
    test: (e) => [e.exit === 0 ? 'Tests passed' : 'Tests failed', join(e.command, has(e.seconds) ? `${e.seconds}s` : '', has(e.fingerprint) ? `content ${String(e.fingerprint).slice(0, 8)}` : ''), e.exit === 0 ? 'good' : 'bad'],
    check: (e) => [`Item ${e.n ?? '?'} proven`, e.evidence || ''],
    uncheck: (e) => [`Item ${e.n ?? '?'} unchecked`, ''],
    void: (e) => [`Item ${e.n ?? '?'} voided`, e.reason || ''],
    manual: (e) => [`Manual check ${e.key || ''} written`.replace('  ', ' '), has(e.n) ? `for item ${e.n}` : '', 'warn'],
    'manual-ok': (e) => [`Manual check ${e.key || ''} passed`.replace('  ', ' '), '', 'good'],
    'manual-failed': (e) => [`Manual check ${e.key || ''} failed`.replace('  ', ' '), '', 'bad'],
    question: (e) => [`Question ${e.key || ''}${e.blocking ? ' (blocking)' : ''}`.replace('  ', ' '), '', 'warn'],
    answer: (e) => [`Question ${e.key || ''} answered`.replace('  ', ' '), ''],
    assumption: (e) => [`Assumption ${e.key || ''} recorded`.replace('  ', ' '), '', 'warn'],
    'assumption-confirmed': (e) => [`Assumption ${e.key || ''} confirmed`.replace('  ', ' '), '', 'good'],
    'assumption-overturned': (e) => [`Assumption ${e.key || ''} overturned`.replace('  ', ' '), '', 'bad'],
    conflict: (e) => ['Conflict with main', (e.files || []).join(', '), 'warn'],
    submitted: (e) => ['Handed over', join(e.commit, has(e.files) ? `${e.files} files` : '', has(e.lane) ? `lane ${e.lane}` : '')],
    // A verdict on how main was brought in has no round: it is not a review round.
    verdict: (e) => {
      const pass = e.result === 'pass';
      const what = e.integration
        ? `Bringing main in: ${pass ? 'passed' : 'sent back'} by the reviewer`
        : `${pass ? 'Passed review' : 'Rejected'}${has(e.round) ? `, round ${e.round}` : ''}`;
      return [what, join(has(e.commit) ? `at ${e.commit}` : '', has(e.failed) ? `failed: ${e.failed}` : ''), pass ? 'good' : 'bad'];
    },
    integrate: (e) => ['Main moved: bringing it in', e.conflict === undefined ? '' : e.conflict ? 'conflict with main' : 'the tests failed on the merged content'],
    integrated: (e) => ['Main brought in', has(e.commit) ? `at ${e.commit}` : ''],
    held: (e) => ['Merge held', e.reason || e.why || '', 'warn'],
    landed: (e) => ['Landed on main', Array.isArray(e.files) ? `${e.files.length} files` : '', 'good'],
    accepted: () => ['Accepted by the owner', ''],
    amended: () => ['Contract amended', ''],
    released: (e) => [`${e.role || 'agent'} released`, e.stopped || ''],
    retry: () => ['Retried', ''],
  };
  // [what happened, detail, tone]
  root.K2Trail = { eventText: (e) => (EVENTS[e.event] || (() => [String(e.event || 'event'), '']))(e) };
})(window);
