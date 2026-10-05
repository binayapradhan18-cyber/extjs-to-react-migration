const encode = (v) => Ext.String.htmlEncode(v);

Ext.define('Shell.view.ShellViewModel', {
  extend: 'Ext.app.ViewModel',
  alias: 'viewmodel.shell',

  data: {
    lastEvent: null,
  },

  formulas: {
    statusLine: function (get) {
      const event = get('lastEvent');
      const last = event
        ? `Last bridge event: <b>${encode(event.side)}</b> ${encode(event.text)}`
        : 'Bridge connected. Interact with either side.';
      return `<span>${last}</span><span>One shared session, one event bus, two UIs</span>`;
    },
  },
});
