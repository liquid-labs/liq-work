const commonCleanParameters = [
  {
    name        : 'noCloseWork',
    isBoolean   : true,
    description : 'Keeps the work entry in the active work DB.'
  },
  {
    name        : 'noDeleteBranches',
    isBoolean   : true,
    description : 'Leaves work branches in place.'
  },
  {
    name        : 'noFetch',
    isBoolean   : true,
    description : 'Supresses default behavior of fetching remote changes before comparing local and remote branches.'
  },
  {
    name        : 'noUpdateLocal',
    isBoolean   : true,
    description : 'Supresses update of local tracking branches.'
  }
]

export { commonCleanParameters }