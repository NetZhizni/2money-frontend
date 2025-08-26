import axios from 'axios'
import { auth } from '@/utils/firebase'

const univesalAPI = async (method, params) => {
  const idToken = await auth.currentUser?.getIdToken()
  const res = await axios({
    method: 'post',
    url: '/api',
    headers: {
      Authorization: 'Bearer ' + idToken,
    },
    data: { method, params },
  })
  return res.data
}

export { univesalAPI }
