export default function AdminCohostPage() {
  if (typeof window !== 'undefined') {
    window.location.href = '/admin'
  }
  return null
}
