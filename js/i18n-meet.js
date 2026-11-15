// js/i18n-meet.js — meeting strings. Load AFTER js/i18n.js, BEFORE page scripts.
(function () {
  if (!window.I18N) return;
  const ADD = {
    zh: {
      'meet.nav': '會面安排',
      'meet.title': '會面安排',
      'meet.desc': '會面時間、會面老師及會面地點由 Excel 匯入，亦可以在此逐項編輯。三項資料會直接印在家長標籤上。',
      'meet.time': '會面時間',
      'meet.teacher': '會面老師',
      'meet.room': '會面地點',
      'meet.label': '會面',
      'meet.search': '搜尋',
      'meet.searchPh': '姓名／班別／班號／老師／地點／時間',
      'meet.allTeachers': '全部老師',
      'meet.allRooms': '全部地點',
      'meet.onlyScheduled': '只顯示已安排',
      'meet.scheduled': '已安排',
      'meet.unscheduled': '未安排',
      'meet.teachers': '老師數目',
      'meet.rooms': '地點數目',
      'meet.export': '匯出會面表',
      'meet.edit': '編輯會面',
      'meet.editTitle': '編輯會面資料',
      'meet.save': '儲存會面資料',
      'meet.clear': '清除會面',
      'meet.clearConfirm': '確定清除此學生的會面時間、老師及地點？',
      'meet.saved': '已儲存會面資料',
      'meet.cleared': '已清除會面資料',
      'meet.none': '未安排',
      'meet.empty': '沒有符合條件的會面記錄。',
      'meet.timePh': '例如 15:30–15:45',
      'meet.teacherPh': '例如 陳老師',
      'meet.roomPh': '例如 204 室',
      'meet.preview': '標籤預覽',
      'meet.previewNote': '預覽即時反映上方輸入，並只顯示有效列印區域。',
      'meet.importNote': 'Excel 可包含 Meeting Time、Meeting Teacher、Meeting Location（亦接受中文表頭：會面時間、會面老師、會面地點）。',
      'meet.overview': '已安排會面',
      'meet.quick': '會面安排',
      'meet.quickDesc': '檢視及編輯時間、老師、地點',
      'meet.student': '學生',
      'meet.noStudents': '請先匯入學生資料。',
      'label.meetTime': '會面時間',
      'label.meetTeacher': '會面老師',
      'label.meetRoom': '會面地點',
      'label.meetLine': '會面綜合行',
      'admin.meetText': '會面內容',
      'admin.meetSize': '會面字級 (px)',
      'admin.meetHint': '會面行會印在中文姓名之下；三項資料皆為空時自動隱藏。'
    },
    en: {
      'meet.nav': 'Meetings',
      'meet.title': 'Meetings',
      'meet.desc': 'Meeting time, teacher and location come from the Excel import and can be edited here per student. All three print on the parent label.',
      'meet.time': 'Meeting time',
      'meet.teacher': 'Meeting teacher',
      'meet.room': 'Meeting location',
      'meet.label': 'Meeting',
      'meet.search': 'Search',
      'meet.searchPh': 'Name / class / class no / teacher / location / time',
      'meet.allTeachers': 'All teachers',
      'meet.allRooms': 'All locations',
      'meet.onlyScheduled': 'Scheduled only',
      'meet.scheduled': 'Scheduled',
      'meet.unscheduled': 'Not scheduled',
      'meet.teachers': 'Teachers',
      'meet.rooms': 'Locations',
      'meet.export': 'Export meetings',
      'meet.edit': 'Edit meeting',
      'meet.editTitle': 'Edit meeting details',
      'meet.save': 'Save meeting',
      'meet.clear': 'Clear meeting',
      'meet.clearConfirm': 'Clear this student’s meeting time, teacher and location?',
      'meet.saved': 'Meeting details saved',
      'meet.cleared': 'Meeting details cleared',
      'meet.none': 'Not arranged',
      'meet.empty': 'No matching meeting records.',
      'meet.timePh': 'e.g. 15:30–15:45',
      'meet.teacherPh': 'e.g. Mr Chan',
      'meet.roomPh': 'e.g. Room 204',
      'meet.preview': 'Label preview',
      'meet.previewNote': 'The preview updates as you type and shows the effective print area only.',
      'meet.importNote': 'Excel may include Meeting Time, Meeting Teacher and Meeting Location (Chinese headers are also accepted).',
      'meet.overview': 'Meetings arranged',
      'meet.quick': 'Meetings',
      'meet.quickDesc': 'View and edit time, teacher, location',
      'meet.student': 'Student',
      'meet.noStudents': 'Import student data first.',
      'label.meetTime': 'Meeting time',
      'label.meetTeacher': 'Meeting teacher',
      'label.meetRoom': 'Meeting location',
      'label.meetLine': 'Meeting line',
      'admin.meetText': 'Meeting text',
      'admin.meetSize': 'Meeting size (px)',
      'admin.meetHint': 'The meeting line prints below the Chinese name and hides itself when all three fields are empty.'
    }
  };
  const origT = I18N.t, origApply = I18N.apply;
  const pick = (k) => { const d = ADD[I18N.lang]; return d && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; };
  const sub = (s, v) => { let o = s; if (v) Object.keys(v).forEach(x => { o = o.split('{' + x + '}').join(v[x]); }); return o; };
  I18N.t = function (k, v) { const s = pick(k); return s != null ? sub(s, v) : origT(k, v); };
  I18N.apply = function (root) {
    origApply(root);
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach(el => { const s = pick(el.getAttribute('data-i18n')); if (s != null) el.textContent = s; });
    r.querySelectorAll('[data-i18n-html]').forEach(el => { const s = pick(el.getAttribute('data-i18n-html')); if (s != null) el.innerHTML = s; });
    r.querySelectorAll('[data-i18n-ph]').forEach(el => { const s = pick(el.getAttribute('data-i18n-ph')); if (s != null) el.placeholder = s; });
    r.querySelectorAll('[data-i18n-title]').forEach(el => { const s = pick(el.getAttribute('data-i18n-title')); if (s != null) el.title = s; });
  };
})();
