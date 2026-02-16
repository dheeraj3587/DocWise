import React from 'react'
import {Sidebar} from '../components/sidebar'

const layout = ({children}:{children: React.ReactNode}) => {
  return (
    <div className="flex h-screen bg-mesh">
      <Sidebar />
      <div className='w-full h-screen'>{children}</div>
    </div>
  )
}

export default layout
