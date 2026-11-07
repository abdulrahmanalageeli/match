import { endpoint, notification } from '../_shared/apple.ts'
Deno.serve(endpoint(notification))
