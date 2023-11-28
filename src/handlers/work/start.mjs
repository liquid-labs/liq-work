import { doStart, getStartEndpointParams } from './_lib/start-lib'

const { help, method, parameters } = getStartEndpointParams()

const path = ['work', 'start']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const {
    assignee,
    comment,
    issueBug,
    issueDeliverables,
    issueNotes,
    issueOverview,
    issueTitle,
    noAutoAssign = false
  } = req.vars
  const { issues = [], projects } = req.vars

  await doStart({
    app,
    assignee,
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
    res
  })
}

export { func, help, parameters, path, method }
