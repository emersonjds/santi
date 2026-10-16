// ponytail: placeholder body for project pages whose cards come later (board, backlog, search).
export const ComingNextPage = ({ title }: { title: string }) => (
  <section className='flex flex-col gap-2 px-4 py-10 sm:px-6'>
    <h2 className='text-lg font-semibold'>{title}</h2>
    <p className='text-muted-foreground'>
      The {title.toLowerCase()} is coming next. Projects, members and invite
      links already work.
    </p>
  </section>
)
