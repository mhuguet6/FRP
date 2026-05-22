import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './useSession'

type StaffStatus =
  | { status: 'loading' }
  | { status: 'staff'; rol: string }
  | { status: 'not_staff' }

export function useStaffStatus(): StaffStatus {
  const session = useSession()
  const [state, setState] = useState<StaffStatus>({ status: 'loading' })

  useEffect(() => {
    if (session.status === 'loading') {
      setState({ status: 'loading' })
      return
    }
    if (session.status === 'anonymous') {
      setState({ status: 'not_staff' })
      return
    }
    const email = session.session.user.email
    if (!email) {
      setState({ status: 'not_staff' })
      return
    }
    supabase
      .from('staff_emails')
      .select('rol')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setState({ status: 'staff', rol: data.rol })
        else setState({ status: 'not_staff' })
      })
  }, [session])

  return state
}
