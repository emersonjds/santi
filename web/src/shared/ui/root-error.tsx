export const RootError = ({ message }: { message?: string }) =>
  message ? (
    <p role='alert' className='text-sm text-destructive'>
      {message}
    </p>
  ) : null
