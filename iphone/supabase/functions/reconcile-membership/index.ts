import { endpoint, reconcile } from '../_shared/apple.ts'

Deno.serve(endpoint(reconcile))
