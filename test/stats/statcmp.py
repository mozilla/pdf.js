from numpy import *
from scipy import stats
import json, locale
from optparse import OptionParser

VALID_GROUP_BYS = ['browser', 'pdf', 'page', 'round', 'stat']
USAGE_EXAMPLE = "%prog BASELINE CURRENT"
class TestOptions(OptionParser):
    def __init__(self, **kwargs):
        OptionParser.__init__(self, **kwargs)
        self.add_option("--groupBy", action="append", dest="groupBy", type="string",
                        help="How the statistics should grouped. Valid options: " + ', '.join(VALID_GROUP_BYS) + '.', default=[])

        self.set_usage(USAGE_EXAMPLE)

    def verifyOptions(self, options, args):
        if len(args) < 2:
            self.error('There must be two comparison files arguments.')
        # Veryify the group by options.
        groupBy = []
        if not options.groupBy:
          options.groupBy = ['browser,stat', 'browser,pdf,stat']
        for group in options.groupBy:
            group = group.split(',')
            for column in group:
              if column not in VALID_GROUP_BYS:
                self.error('Invalid group by option of "' + column + '"')
            groupBy.append(group)
        options.groupBy = groupBy

        return options

## {{{ http://code.activestate.com/recipes/267662/ (r7)
import cStringIO,operator

def indent(rows, hasHeader=False, headerChar='-', delim=' | ', justify='left',
           separateRows=False, prefix='', postfix='', wrapfunc=lambda x:x):
    """Indents a table by column.
       - rows: A sequence of sequences of items, one sequence per row.
       - hasHeader: True if the first row consists of the columns' names.
       - headerChar: Character to be used for the row separator line
         (if hasHeader==True or separateRows==True).
       - delim: The column delimiter.
       - justify: Determines how are data justified in their column. 
         Valid values are 'left','right' and 'center'.
       - separateRows: True if rows are to be separated by a line
         of 'headerChar's.
       - prefix: A string prepended to each printed row.
       - postfix: A string appended to each printed row.
       - wrapfunc: A function f(text) for wrapping text; each element in
         the table is first wrapped by this function."""
    # closure for breaking logical rows to physical, using wrapfunc
    def rowWrapper(row):
        newRows = [wrapfunc(str(item)).split('\n') for item in row]
        return [[substr or '' for substr in item] for item in map(None,*newRows)]
    # break each logical row into one or more physical ones
    logicalRows = [rowWrapper(row) for row in rows]
    # columns of physical rows
    columns = map(None,*reduce(operator.add,logicalRows))
    # get the maximum of each column by the string length of its items
    maxWidths = [max([len(str(item)) for item in column]) for column in columns]
    rowSeparator = headerChar * (len(prefix) + len(postfix) + sum(maxWidths) + \
                                 len(delim)*(len(maxWidths)-1))
    # select the appropriate justify method
    justify = {'center':str.center, 'right':str.rjust, 'left':str.ljust}[justify.lower()]
    output=cStringIO.StringIO()
    if separateRows: print >> output, rowSeparator
    for physicalRows in logicalRows:
        for row in physicalRows:
            print >> output, \
                prefix \
                + delim.join([justify(str(item),width) for (item,width) in zip(row,maxWidths)]) \
                + postfix
        if separateRows or hasHeader: print >> output, rowSeparator; hasHeader=False
    return output.getvalue()

# written by Mike Brown
# http://aspn.activestate.com/ASPN/Cookbook/Python/Recipe/148061
def wrap_onspace(text, width):
    """
    A word-wrap function that preserves existing line breaks
    and most spaces in the text. Expects that existing line
    breaks are posix newlines (\n).
    """
    return reduce(lambda line, word, width=width: '%s%s%s' %
                  (line,
                   ' \n'[(len(line[line.rfind('\n')+1:])
                         + len(word.split('\n',1)[0]
                              ) >= width)],
                   word),
                  text.split(' ')
                 )

import re
def wrap_onspace_strict(text, width):
    """Similar to wrap_onspace, but enforces the width constraint:
       words longer than width are split."""
    wordRegex = re.compile(r'\S{'+str(width)+r',}')
    return wrap_onspace(wordRegex.sub(lambda m: wrap_always(m.group(),width),text),width)

import math
def wrap_always(text, width):
    """A simple word-wrap function that wraps text on exactly width characters.
       It doesn't split the text in words."""
    return '\n'.join([ text[width*i:width*(i+1)] \
                       for i in xrange(int(math.ceil(1.*len(text)/width))) ])

def formatTime(time):
    return locale.format("%.*f", (0, time), True)

# Group the stats by keys. We should really just stick these in a SQL database
# so we aren't reiventing the wheel.
def group(stats, groupBy):
    vals = {}
    for stat in stats:
        key = []
        for group in groupBy:
            key.append(stat[group])
        key = tuple(key)
        if key not in vals:
            vals[key] = []
        vals[key].append(stat['time'])
    return vals;


def mean(l):
    return array(l).mean()


# Take the somewhat normalized stats file and flatten it so there is a row for
# every recorded stat.
def flatten(stats):
    rows = []
    for stat in stats:
        for s in stat['stats']:
            rows.append({
                'browser': stat['browser'],
                'page': stat['page'],
                'pdf': stat['pdf'],
                'round': stat['round'],
                'stat': s['name'],
                'time': int(s['end']) - int(s['start'])
            })
    return rows

# Dump various stats in a table to compare the baseline and current results.
# T-test Refresher:
# If I understand t-test correctly, p is the probability that we'll observe
# another test that is as extreme as the current result assuming the null
# hypothesis is true. P is NOT the probability of the null hypothesis.
# The null hypothesis in this case is that the baseline and current results will
# be the same. It is generally accepted that you can reject the null hypothesis
# if the p-value is less than 0.05.  So if p < 0.05 we can reject the results
# are the same which doesn't necessarily mean the results are faster/slower but
# it can be implied.
def stat(baseline, current, groupBy):
    labels = groupBy + ['Baseline(ms)', 'Current(ms)', '+/-', '%', 'Result(P<.05)']
    baselineGroup = group(baseline, groupBy)
    currentGroup = group(current, groupBy)
    rows = []
    for key in baselineGroup:
        t, p = stats.ttest_ind(baselineGroup[key], currentGroup[key], equal_var = False)
        baseline = mean(baselineGroup[key])
        current = mean(currentGroup[key])
        speed = ''
        if p < 0.05:
          speed = 'faster' if current < baseline else 'slower'
        row = list(key)
        row += [
            formatTime(baseline),
            formatTime(current),
            formatTime(baseline - current),
            round(100 * (1.0 * baseline - current) / baseline, 2),
            speed
        ]
        rows.append(row)
    rows.sort(key=lambda row: tuple(row[0:len(groupBy)]))
    print indent([labels] + rows, hasHeader=True)

def main():
    optionParser = TestOptions()
    options, args = optionParser.parse_args()
    options = optionParser.verifyOptions(options, args)
    if options == None:
        sys.exit(1)

    with open(args[0]) as baselineFile:
        baseline = flatten(json.load(baselineFile))
    with open(args[1]) as currentFile:
        current = flatten(json.load(currentFile))

    for groupBy in options.groupBy:
      print "-- Grouped By " + ', '.join(groupBy) + ' -- '
      stat(baseline, current, groupBy)


if __name__ == '__main__':
    main()
