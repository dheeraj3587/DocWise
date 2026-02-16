export const dynamic = 'force-dynamic'

import React from 'react'
import {Sidebar} from '../components/sidebar'

const DashboardLayout = ({children}:{children: React.ReactNode}) => {
  return (
    <div className="flex h-screen bg-mesh">
      <Sidebar />
      <div className='w-full h-screen'>{children}</div>
    </div>
  )
}

export default DashboardLayout
