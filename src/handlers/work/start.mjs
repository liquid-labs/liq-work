import { doStart, getStartEndpointParams } from './_lib/start-lib'

const { help, method, parameters } = getStartEndpointParams()

const path = ['work', 'start']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { // doing the var deconstruction heer is idiomatic; it is usually done in the lib
    assignee,
    comment,
    issueBug,
    issueDeliverables,
    issueNotes,
    issueOverview,
    issueTitle,
    noAutoAssign = false,
    submit = false
  } = req.vars
  const { issues = [], projects } = req.vars

  await doStart({
    app,
    assignee,
    cache,
    comment,
    issueBug,
    issueDeliverables,
    issueNotes,
    issueOverview,
    issues,
    issueTitle,
    noAutoAssign,
    projects,
    reporter,
    req,
    res,
    submit
  })
}

export { func, help, parameters, path, method }
