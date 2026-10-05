import { bridge } from '../../bridge.js';

const loadTasksWidget = () => import('@migration/react-app/widget').then((m) => m.mountTasksWidget);

const paneHeader = (badge, title, note) =>
  `<span class="cmp-badge cmp-badge-${badge}">${badge === 'before' ? 'Before' : 'After'}</span>` +
  `<span class="cmp-title">${title}</span><span class="cmp-note">${note}</span>`;

Ext.define('Shell.view.Shell', {
  extend: 'Ext.container.Viewport',
  alias: 'widget.shell',
  controller: 'shell',
  viewModel: 'shell',
  layout: 'vbox',
  cls: 'shell compare',

  initComponent() {
    this.items = [
      {
        xtype: 'component',
        cls: 'cmp-header',
        html:
          '<h1>Ext JS &rarr; React migration</h1>' +
          '<p>The same <b>Project Tasks</b> screen, twice. Left is the original Ext JS code; right is the React ' +
          'rewrite, mounted inside the Ext page by <code>Bridge.ReactHost</code>. Select or save a task on ' +
          'either side and watch the other follow.</p>',
      },
      {
        xtype: 'container',
        cls: 'cmp-row',
        layout: 'hbox',
        flex: 1,
        items: [
          {
            xtype: 'container',
            cls: 'cmp-pane cmp-pane-legacy',
            layout: 'vbox',
            flex: 1,
            items: [
              {
                xtype: 'component',
                cls: 'cmp-pane-header',
                html: paneHeader('before', 'Ext JS', 'Ext.define · Store · ViewModel bind · ViewController'),
              },
              { xtype: 'tasks-main', flex: 1 },
            ],
          },
          {
            xtype: 'container',
            cls: 'cmp-pane cmp-pane-react',
            layout: 'vbox',
            flex: 1,
            items: [
              {
                xtype: 'component',
                cls: 'cmp-pane-header',
                html: paneHeader('after', 'React', 'TanStack Query · TanStack Table · React Hook Form + Zod'),
              },
              { xtype: 'reacthost', flex: 1, load: loadTasksWidget, props: bridge.hostContext, observeResize: true },
            ],
          },
        ],
      },
      { xtype: 'component', cls: 'shell-status', bind: { html: '{statusLine}' } },
    ];
    this.callParent();
  },
});
