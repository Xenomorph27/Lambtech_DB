import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell.jsx'
import Overview from './pages/Overview.jsx'
import Enquiries from './pages/Enquiries.jsx'
import Emails from './pages/Emails.jsx'
import Responses from './pages/Responses.jsx'
import Leads from './pages/Leads.jsx'
import Transactions from './pages/Transactions.jsx'
import Contacts from './pages/Contacts.jsx'
import Companies from './pages/Companies.jsx'
import Suppressions from './pages/Suppressions.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="emails" element={<Emails />} />
        <Route path="responses" element={<Responses />} />
        <Route path="leads" element={<Leads />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="companies" element={<Companies />} />
        <Route path="suppressions" element={<Suppressions />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
