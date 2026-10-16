const LAST_PROJECT = 'santi:last-project'

// Storage can throw (private mode, blocked site data): the create dialog then preselects the first project.
export const rememberProject = (key: string) => {
  try {
    localStorage.setItem(LAST_PROJECT, key)
  } catch {
    // nothing to remember with
  }
}

export const lastProject = () => {
  try {
    return localStorage.getItem(LAST_PROJECT)
  } catch {
    return null
  }
}
