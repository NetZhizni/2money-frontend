// ECharts ships as a tree-shakeable core (`echarts/core`) plus opt-in chart
// types/components/renderers — importing the `echarts` umbrella package
// instead would pull in every chart type and renderer this app never uses.
// Every chart component lazy-imports *this* module (see useECharts.ts)
// rather than registering its own subset, so all charts share one
// registration call and one resulting async chunk instead of each mounting
// component re-registering (and re-bundling) overlapping pieces.
import * as echarts from 'echarts/core'
import { PieChart, LineChart, BarChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, LineChart, BarChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

export default echarts
