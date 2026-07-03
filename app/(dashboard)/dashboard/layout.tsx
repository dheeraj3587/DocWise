export const dynamic = 'force-dynamic'

import React from 'react'
import {Sidebar} from '../components/sidebar'

const DashboardLayout = ({children}:{children: React.ReactNode}) => {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className='h-screen min-w-0 flex-1'>{children}</div>
    </div>
  )
}

export default DashboardLayout
