import './extlite/ext-lite.css';
import './app.css';
import './extlite/index.js';
import './app/model/Task.js';
import './app/store/Tasks.js';
import './app/view/tasks/TasksViewModel.js';
import './app/view/tasks/TasksController.js';
import './app/view/tasks/TaskGrid.js';
import './app/view/tasks/TaskForm.js';
import './app/view/tasks/TasksMain.js';
import './app/view/shell/ShellViewModel.js';
import './app/view/shell/ShellController.js';
import './app/view/shell/Shell.js';
import { bridge } from './app/bridge.js';
import { session } from './app/session.js';

// Shared auth: every legacy Ajax call and every React fetch carries the same session token.
Ext.Ajax.defaultHeaders.Authorization = `Bearer ${session.token}`;

// App-level store shared by every module, legacy or React, for the lifetime of the shell.
Ext.create('Tasks.store.Tasks');

const shell = Ext.create('Shell.view.Shell', {
  viewModel: { type: 'shell', data: { session } },
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    shell.destroy();
    bridge.disconnect();
  });
}
