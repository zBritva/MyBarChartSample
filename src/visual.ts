/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
module powerbi.extensibility.visual {

    import ITooltipServiceWrapper = powerbi.extensibility.utils.tooltip.ITooltipServiceWrapper;
    import createTooltipServiceWrapper = powerbi.extensibility.utils.tooltip.createTooltipServiceWrapper;
    import TooltipEventArgs = powerbi.extensibility.utils.tooltip.TooltipEventArgs;
    interface MyBarChartSettings {
        enableAxis: {
            show: boolean;
        };
    }

    interface MyBarChartViewModel {
        dataPoints: MyBarChartDataPoint[];
        dataMax: number;
        settings: MyBarChartSettings
    }

    interface MyBarChartDataPoint {
        value: number;
        category: string;
        color: string;
        selectionId?: ISelectionId;
    }


    export class Visual implements IVisual {
        private target: HTMLElement;
        private updateCount: number;
        private svg: d3.Selection<SVGElement>;
        private host: IVisualHost;
        private barChartContainer: d3.Selection<SVGElement>;
        private barContainer: d3.Selection<SVGElement>;
        private bars: d3.Selection<SVGElement>;
        private xAxis: d3.Selection<SVGElement>;
        private selectionManager: ISelectionManager;
        private barChartSettings: MyBarChartSettings;
        private tooltipServiceWrapper: ITooltipServiceWrapper;

        static Config = {
            xScalePadding: 0.1,
            solidOpacity: 1,
            transparentOpacity: 0.5,
            margins: {
                top: 0,
                right: 0,
                bottom: 25,
                left: 30,
            },
            xAxisFontMultiplier: 0.04,
        };

        constructor(options: VisualConstructorOptions) {
            console.log('Visual constructor', options);
            this.target = options.element;
            this.host = options.host;
            let svg = this.svg = d3.select(options.element).append('svg').classed('barChart', true);

            this.barContainer = svg.append('g').classed('barContainer', true);
            this.xAxis = svg.append('g').classed('xAxis', true);
            this.selectionManager = options.host.createSelectionManager();
            this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);

            // this.tooltipServiceWrapper.addTooltip(this.barContainer.selectAll('.bar'),
            //                     (tooltipEvent: TooltipEventArgs<number>) => Visual.getTooltipData(tooltipEvent.data),
            //                     (tooltipEvent: TooltipEventArgs<number>) => null);
        }

        public visualTransform(options: VisualUpdateOptions): MyBarChartViewModel {
            let dataView = options.dataViews;
            let defaultSettings: MyBarChartSettings = {
                enableAxis: {
                    show: false
                }
            };

            let viewModel: MyBarChartViewModel = {
                dataPoints: [],
                dataMax: 0,
                settings: defaultSettings
            };

            if (!dataView
                || !dataView[0]
                || !dataView[0].categorical
                || !dataView[0].categorical.categories
                || !dataView[0].categorical.categories[0]
                || !dataView[0].categorical.categories[0].source
                || !dataView[0].categorical.values
            )
                return viewModel;

            let categorical = dataView[0].categorical;
            let category = categorical.categories[0];
            let dataValue = categorical.values[0];

            let barChartDataPoints: MyBarChartDataPoint[] = [];
            let dataMax: number;

            let colorPalette: IColorPalette = this.host.colorPalette;
            let objects = dataView[0].metadata.objects;
            let barChartSettings: MyBarChartSettings = {
                enableAxis: {
                    show: getValue<boolean>(objects, 'enableAxis', 'show', defaultSettings.enableAxis.show)
                }
            };

            for (let index = 0, len = Math.max(category.values.length, dataValue.values.length); index < len; index++) {
                barChartDataPoints.push({
                    category: <string>category.values[index],
                    value: <number>dataValue.values[index],
                    color: <string>colorPalette.getColor(<string>category.values[index]).value,
                    selectionId: this.host.createSelectionIdBuilder()
                        .withCategory(category, index)
                        .createSelectionId()
                });
            }

            dataMax = <number> dataValue.maxLocal;

            return {
                dataPoints: barChartDataPoints,
                dataMax: dataMax,
                settings: barChartSettings
            };
        }

        public update(options: VisualUpdateOptions) {
            console.log('Visual update', options);

            let viewModel = this.visualTransform(options);

            let width = options.viewport.width;
            let height = options.viewport.height;

            let settings = this.barChartSettings = viewModel.settings;

            this.svg.attr({
                width: width,
                height: height
            });

            if (settings.enableAxis.show) {
                let margins = Visual.Config.margins;
                height -= margins.bottom;
            }

            this.xAxis.style({
                'font-size': d3.min([height, width]) * Visual.Config.xAxisFontMultiplier
            });

            let yScale = d3.scale.linear().domain([0, viewModel.dataMax]).range([height, 0]);

            let xScale = d3.scale.ordinal().domain(viewModel.dataPoints.map(d => d.category))
                .rangeRoundBands([0, width], Visual.Config.xScalePadding);

            let xAxis = d3.svg.axis().scale(xScale).orient('bottom');

            this.xAxis.attr('transform', 'translate(0, ' + height + ')').call(xAxis);

            let barsGroup = this.barContainer.selectAll('.bar').data(viewModel.dataPoints);

            barsGroup.enter().append('g').classed('bar', true);
            barsGroup.attr({
                width: xScale.rangeBand(),
                height: d => height - yScale(d.value),
                y: d => yScale(d.value),
                x: d => xScale(d.category),
                fill: d => d.color,
                'fill-opacity': Visual.Config.solidOpacity
            });

            let bars = barsGroup.append('rect').classed('bar', true)
            .attr({
                width: xScale.rangeBand(),
                height: d => height - 50 - yScale(d.value),
                y: d => yScale(d.value),
                x: d => xScale(d.category),
                fill: d => d.color,
                'fill-opacity': Visual.Config.solidOpacity
            });
            let texts = barsGroup
                .append('text')
                .attr({
                    y: d =>  height - 20 - (height - yScale(d.value)) / 2,
                    x: d => xScale(d.category) + 20,
                    fill: d => "BLACK",
                })
                .classed('bar-text', true)
                .text(d => { return d.value});

            let selectionManager = this.selectionManager;

            barsGroup.on('click', function (d) {
                selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
                    barsGroup.attr({
                        'fill-opacity': ids.length > 0 ? Visual.Config.transparentOpacity : Visual.Config.solidOpacity
                    });

                    d3.select(this).attr({
                        'fill-opacity': Visual.Config.solidOpacity
                    });
                });

                (<Event>d3.event).stopPropagation();
            });

            barsGroup.exit().remove();
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            switch (objectName) {
                case 'enableAxis':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: this.barChartSettings.enableAxis.show,
                        },
                        selector: null
                    });
            };

            return objectEnumeration;
        }
    }
}