module.exports = (env, callback) ->
  count = (string, substr) ->
    num = pos = 0
    return 1/0 unless substr.length
    num++ while pos = 1 + string.indexOf(substr, pos)
    num

  env.helpers.makeRelative = (source, dest) ->
    return dest unless dest.indexOf("/") == 0
    depth = count(source, '/') # 1 being /
    ret = ""
    ret += "../" while depth = depth - 1
    ret + dest.substr(1)

  callback()