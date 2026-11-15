import { useNavigate } from 'react-router-dom'
import { chatApi, errorMessage } from '../api'
import { useChat } from '../store/chat'
import { toast } from '../store/toast'

/** Start (or open) a direct chat with a friend. */
export function useMessage() {
  const navigate = useNavigate()
  const upsert = useChat((s) => s.upsertConversation)
  return async (userId: number, after?: () => void) => {
    try {
      const c = await chatApi.direct(userId)
      upsert(c)
      after?.()
      navigate(`/c/${c.id}`)
    } catch (e) {
      toast(errorMessage(e, 'Could not start chat'))
    }
  }
}
