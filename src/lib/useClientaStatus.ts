import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './useSession'

type ClientaStatus =
  | { status: 'loading' }
  | { status: 'clienta'; email: string }
  | { status: 'not_clienta' }

export function useClientaStatus(): ClientaStatus {
  const session = useSession()
  const [state, setState] = useState<ClientaStatus>({ status: 'loading' })

  useEffect(() => {
    if (session.status === 'loading') {
      setState({ status: 'loading' })
      return
    }
    if (session.status === 'anonymous') {
      setState({ status: 'not_clienta' })
      return
    }
    const email = session.session.user.email
    if (!email) {
      setState({ status: 'not_clienta' })
      return
    }
    supabase
      .from('clienta_emails')
      .select('email')
      .eq('email', email.toLowerCase())
      .maybeSingle()
      .then(({ data }) => {
        if (data) setState({ status: 'clienta', email })
        else setState({ status: 'not_clienta' })
      })
  }, [session])

  return state
}
