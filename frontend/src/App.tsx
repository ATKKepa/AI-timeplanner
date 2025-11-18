import { useState } from 'react';
import { AppLayout, type Page } from './components/layout/AppLayout';
import { ChatView } from './features/chat/ChatView';
import { TasksView } from './features/tasks/TasksView';
import { CalendarView } from './features/calendar/CalendarView';

function App() {
  const [activePage, setActivePage] = useState<Page>('chat');

  return (
    <AppLayout activePage={activePage} onChangePage={setActivePage}>
      {activePage === 'chat' && <ChatView />}
      {activePage === 'tasks' && <TasksView />}
      {activePage === 'calendar' && <CalendarView />}
    </AppLayout>
  );
}

export default App;
