(function doctorvilleChannelPage(job, mode) {
  const unknown = {status:'unknown'};
  const inspect = mode === 'doctorville_channel_inspect';
  if (!inspect && mode !== 'doctorville_channel_confirm') return unknown;
  if (job?.site !== 'doctorville' || typeof job.key !== 'string' || !job.key ||
      !Number.isFinite(job.due) || !Number.isFinite(job.deadline) ||
      Date.now() < job.due || Date.now() > job.deadline) return unknown;

  function seminar(raw) {
    if (typeof raw !== 'string' || raw.length > 2048 || /[\s\\%#]/.test(raw)) return null;
    const url = new URL(raw);
    if (!['https://www.doctorville.co.kr','https://m.doctorville.co.kr'].includes(url.origin) ||
        url.username || url.password ||
        !['/seminar/seminarDetail','/seminar/broadcastSeminarPopup'].includes(url.pathname)) return null;
    const id = url.searchParams.get('seminarId');
    if (!/^\d{1,10}$/.test(id || '') || url.searchParams.getAll('seminarId').length !== 1 ||
        url.searchParams.getAll('viewType').length > 1) return null;
    for (const [key, value] of url.searchParams) {
      if (key !== 'seminarId' && !(key === 'viewType' && /^[12]$/.test(value))) return null;
    }
    return {id, path:url.pathname};
  }

  try {
    const here = seminar(location.href), expected = seminar(job.url);
    if (window.top !== window.self || !here || !expected || here.id !== expected.id ||
        (job.lectureIdentity && (job.lectureIdentity.kind !== 'seminar' || job.lectureIdentity.id !== here.id)) ||
        !document.body || document.readyState === 'loading') return unknown;
    const previous = window.__doctorGleanDoctorvilleChannel;
    if (!inspect && previous && !previous.sent) delete window.__doctorGleanDoctorvilleChannel;
    const compact = text => String(text || '').replace(/\s+/g, '');
    const text = el => compact(el.innerText || el.textContent);
    function visible(el) {
      if (!el || el.closest('[hidden],[inert],[aria-hidden="true"]') || !el.getClientRects().length) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 ||
          rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.visibility === 'collapse' ||
            style.display === 'none' || style.opacity === '0') return false;
      }
      return true;
    }
    const all = (root, selector) => Array.from(root.querySelectorAll(selector));
    const dialogSelector = '[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog[open]';
    const dialogs = all(document, dialogSelector).filter(visible);
    if (dialogs.length > 1 || all(document, 'input[type="password"]').some(visible) ||
        /사람인지확인|로봇이아닙니다|보안확인|비정상적인접근|접근이차단|요청횟수제한|Verifyyouarehuman|Checkingyourbrowser/i.test(text(document.body))) return unknown;
    const buttonSelector = 'button,a,input[type="button"],[role="button"]';
    const label = el => el.tagName === 'INPUT' ? compact(el.value) : text(el);
    const controls = all(document, buttonSelector).filter(el => label(el) === '확인' && visible(el));
    const phrases = ['채널선택','안정적인영상제공을위해2가지채널을제공합니다','영상이불안정하다면채널을변경해보세요'];
    function chooser(button) {
      if (button.closest('form,[aria-disabled="true"],[disabled]') || button.hasAttribute('form') ||
          button.hasAttribute('formaction') || button.hasAttribute('target') || button.hasAttribute('download')) return null;
      const href = button.getAttribute('href');
      if (href && !/^(?:#|javascript:void\(0\);?)$/i.test(href)) return null;
      for (let root = button.parentElement; root && root !== document.body; root = root.parentElement) {
        const message = text(root).replace(/[.!]/g, '');
        if (!phrases.every(part => message.includes(part))) continue;
        // Keep the scope inside a single chooser; unrelated offers or consent text invalidate it.
        let extra = message;
        for (const part of [...phrases, '채널1','채널2','확인']) extra = extra.replace(part, '');
        if (extra || !visible(root) || (dialogs.length && !dialogs[0].contains(root)) ||
            root.querySelector('form,iframe') || root.closest('form')) return null;
        const choices = all(root, 'input[type="radio"]');
        const active = all(root, 'button,a,input,textarea,select,[role="button"],[contenteditable="true"]').filter(visible);
        if (choices.length !== 2 || active.some(el => el !== button && !choices.includes(el)) ||
            choices.some(radio => radio.closest('[disabled],[aria-disabled="true"],[inert],[aria-hidden="true"]')) ||
            !choices[0].name || choices[0].name !== choices[1].name) return null;
        function channelName(radio) {
          // Sites may style a native radio using only its visible associated label.
          const labels = all(root, 'label').filter(el => {
            if (!visible(el)) return false;
            const id = el.getAttribute('for');
            if (id !== null) return id === radio.id && document.getElementById(id) === radio;
            const wrapped = el.querySelectorAll('input');
            return wrapped.length === 1 && wrapped[0] === radio;
          });
          if (labels.length > 1) return '';
          if (labels.length === 1) return text(labels[0]);
          const row = radio.parentElement;
          return visible(radio) && row.querySelectorAll('input').length === 1 ? text(row) : '';
        }
        const names = choices.map(channelName);
        if (!names.includes('채널1') || !names.includes('채널2')) return null;
        const selected = choices.filter(radio => radio.checked === true);
        if (selected.length !== 1) return null;
        if (typeof document.elementFromPoint === 'function') {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
          if (!hit || !button.contains(hit)) return null;
        }
        return {root, button, selected:selected[0], channel:names[choices.indexOf(selected[0])], group:choices[0].name, value:selected[0].value};
      }
      return null;
    }
    const matches = controls.map(chooser).filter(Boolean);
    if (matches.length === 1) {
      const current = matches[0];
      if (previous?.sent && previous.document === document) return unknown;
      if (inspect) {
        window.__doctorGleanDoctorvilleChannel = {...current, document, href:location.href, key:job.key, sent:false};
        return {status:'channel_ready'};
      }
      if (previous?.document !== document || previous.key !== job.key || previous.href !== location.href ||
          previous.root !== current.root || previous.button !== current.button || previous.selected !== current.selected ||
          previous.channel !== current.channel || previous.group !== current.group || previous.value !== current.value) return unknown;
      previous.sent = true;
      window.__doctorGleanDoctorvilleChannel = previous;
      current.button.click();
      return {status:'channel_confirmed'};
    }
    if (inspect && previous && !previous.sent) delete window.__doctorGleanDoctorvilleChannel;
    if (!inspect || matches.length || dialogs.length || here.path !== '/seminar/broadcastSeminarPopup') return unknown;
    const roomNodes = all(document.body, 'h1,h2,h3,h4,h5,h6,header,section,figure,figcaption,strong,b,p,span,div,li,dt,a,button,img[alt]');
    let heading = false, qa = false, message = false, waiting = false;
    for (const el of roomNodes) {
      const raw = el.tagName === 'IMG' ? el.getAttribute('alt') : el.textContent;
      if (!raw || raw.length > 450) continue;
      const value = el.tagName === 'IMG' ? compact(raw) : text(el);
      if (value === '채널선택' && visible(el)) return unknown;
      const isHeading = value === '라이브세미나';
      const isQa = value === 'Q&A', isMessage = value.toLowerCase() === 'keymessage';
      const isWaiting = value.length <= 230 && /라이브세미나방송준비중/.test(value) && /잠시만기다려주세요/.test(value);
      if ((isHeading || isQa || isMessage || isWaiting) && visible(el)) {
        heading ||= isHeading; qa ||= isQa; message ||= isMessage; waiting ||= isWaiting;
      }
    }
    if (waiting && (qa || message)) return {status:'waiting_room'};
    if (!heading || !qa || !message) return unknown;
    // This identifies a mounted broadcast room only. Its media may still show a slate.
    const player = all(document,'video,iframe').some(el => {
      if (!visible(el)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 100) return false;
      if (el.tagName === 'VIDEO') return true;
      const name = compact(el.title || el.getAttribute('aria-label')).toLowerCase();
      if (!/^(?:(?:라이브세미나|세미나|라이브)(?:영상|방송|플레이어)|방송플레이어|liveplayer|seminarplayer)$/.test(name)) return false;
      const src = el.getAttribute('src');
      if (!src || el.hasAttribute('srcdoc')) return false;
      const frame = new URL(src, location.href);
      return frame.origin === new URL(location.href).origin && frame.protocol === 'https:' && !frame.username && !frame.password;
    });
    return player ? {status:'broadcast_room'} : unknown;
  } catch {
    return unknown;
  }
})