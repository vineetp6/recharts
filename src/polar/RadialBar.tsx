/**
 * @fileOverview Render a group of radial bar
 */
import React, { PureComponent, ReactElement } from 'react';
import clsx from 'clsx';
import Animate from 'react-smooth';
import isEqual from 'lodash/isEqual';
import isFunction from 'lodash/isFunction';

import { parseCornerRadius, RadialBarSector, RadialBarSectorProps } from '../util/RadialBarUtils';
import { Props as SectorProps } from '../shape/Sector';
import { Layer } from '../container/Layer';
import { findAllByType, filterProps } from '../util/ReactUtils';
import { Global } from '../util/Global';
import { ImplicitLabelListType, LabelList } from '../component/LabelList';
import { Cell } from '../component/Cell';
import { mathSign, interpolateNumber } from '../util/DataUtils';
import {
  getCateCoordinateOfBar,
  findPositionOfBar,
  getValueByDataKey,
  truncateByDomain,
  getBaseValueOfBar,
  getTooltipItem,
  getTooltipNameProp,
} from '../util/ChartUtils';
import {
  LegendType,
  TooltipType,
  AnimationTiming,
  TickItem,
  adaptEventsOfChild,
  PresentationAttributesAdaptChildEvent,
  AnimationDuration,
  ActiveShape,
  LayoutType,
} from '../util/types';
import { polarToCartesian } from '../util/PolarUtils';
import type { Payload as LegendPayload } from '../component/DefaultLegendContent';
import { useLegendPayloadDispatch } from '../context/legendPayloadContext';
import {
  useMouseClickItemDispatch,
  useMouseEnterItemDispatch,
  useMouseLeaveItemDispatch,
  useTooltipContext,
} from '../context/tooltipContext';
import { TooltipPayloadConfiguration } from '../state/tooltipSlice';
import { SetTooltipEntrySettings } from '../state/SetTooltipEntrySettings';
import { ReportBar } from '../state/ReportBar';
// TODO: Cause of circular dependency. Needs refactoring of functions that need them.
// import { AngleAxisProps, RadiusAxisProps } from './types';

type RadialBarDataItem = SectorProps & {
  value?: any;
  payload?: any;
  background?: SectorProps;
};

type RadialBarBackground = ActiveShape<SectorProps>;

type RadialBarSectorsProps = {
  sectors: SectorProps[];
  allOtherRadialBarProps: RadialBarProps;
};

function RadialBarSectors(props: RadialBarSectorsProps) {
  const { sectors, allOtherRadialBarProps } = props;
  const { shape, activeShape, cornerRadius, ...others } = allOtherRadialBarProps;
  const baseProps = filterProps(others, false);

  const { index: activeIndex, active: isTooltipActive } = useTooltipContext();
  const {
    onMouseEnter: onMouseEnterFromProps,
    onClick: onItemClickFromProps,
    onMouseLeave: onMouseLeaveFromProps,
    ...restOfAllOtherProps
  } = allOtherRadialBarProps;

  const onMouseEnterFromContext = useMouseEnterItemDispatch(onMouseEnterFromProps, allOtherRadialBarProps.dataKey);
  const onMouseLeaveFromContext = useMouseLeaveItemDispatch(onMouseLeaveFromProps);
  const onClickFromContext = useMouseClickItemDispatch(onItemClickFromProps, allOtherRadialBarProps.dataKey);

  return (
    <>
      {sectors.map((entry, i) => {
        const isActive = isTooltipActive && activeShape && i === activeIndex;
        const onMouseEnter = (e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
          // @ts-expect-error the types need a bit of attention
          onMouseEnterFromContext(entry, i, e);
        };
        const onMouseLeave = (e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
          // @ts-expect-error the types need a bit of attention
          onMouseLeaveFromContext(entry, i, e);
        };
        const onClick = (e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
          // @ts-expect-error the types need a bit of attention
          onClickFromContext(entry, i, e);
        };

        const radialBarSectorProps: RadialBarSectorProps = {
          ...baseProps,
          cornerRadius: parseCornerRadius(cornerRadius),
          ...entry,
          ...adaptEventsOfChild(restOfAllOtherProps, entry, i),
          onMouseEnter,
          onMouseLeave,
          onClick,
          key: `sector-${i}`,
          className: `recharts-radial-bar-sector ${entry.className}`,
          forceCornerRadius: others.forceCornerRadius,
          cornerIsExternal: others.cornerIsExternal,
          isActive,
          option: isActive ? activeShape : shape,
        };

        return <RadialBarSector {...radialBarSectorProps} />;
      })}
    </>
  );
}

interface InternalRadialBarProps {
  animationId?: string | number;
  className?: string;
  angleAxisId?: string | number;
  radiusAxisId?: string | number;
  startAngle?: number;
  endAngle?: number;
  shape?: ActiveShape<SectorProps, SVGPathElement>;
  activeShape?: ActiveShape<SectorProps, SVGPathElement>;
  dataKey: string | number | ((obj: any) => any);
  cornerRadius?: string | number;
  forceCornerRadius?: boolean;
  cornerIsExternal?: boolean;
  minPointSize?: number;
  maxBarSize?: number;
  data?: RadialBarDataItem[];
  legendType?: LegendType;
  tooltipType?: TooltipType;
  hide?: boolean;
  label?: ImplicitLabelListType<any>;
  stackId?: string | number;
  background?: RadialBarBackground;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  isAnimationActive?: boolean;
  animationBegin?: number;
  animationDuration?: AnimationDuration;
  animationEasing?: AnimationTiming;
}

export type RadialBarProps = PresentationAttributesAdaptChildEvent<any, SVGElement> & InternalRadialBarProps;

interface State {
  readonly isAnimationFinished?: boolean;
  readonly prevData?: RadialBarDataItem[];
  readonly curData?: RadialBarDataItem[];
  readonly prevAnimationId?: string | number;
}

type RadialBarComposedData = {
  data: RadialBarDataItem[];
  layout: LayoutType;
};

type RadialBarPayloadInputProps = {
  data: RadialBarDataItem[];
  legendType?: LegendType;
};

const computeLegendPayloadFromRadarData = ({ data, legendType }: RadialBarPayloadInputProps): Array<LegendPayload> => {
  return data.map(
    (entry: RadialBarDataItem): LegendPayload => ({
      type: legendType,
      value: entry.name,
      color: entry.fill,
      payload: entry,
    }),
  );
};

function SetRadialBarPayloadLegend(props: RadialBarPayloadInputProps): null {
  useLegendPayloadDispatch(computeLegendPayloadFromRadarData, props);
  return null;
}

function getTooltipEntrySettings(props: RadialBarProps): TooltipPayloadConfiguration {
  const { dataKey, data, stroke, strokeWidth, name, hide, fill, tooltipType } = props;
  return {
    dataDefinedOnItem: data,
    settings: {
      stroke,
      strokeWidth,
      fill,
      nameKey: undefined, // RadialBar does not have nameKey, why?
      dataKey,
      name: getTooltipNameProp(name, dataKey),
      hide,
      type: tooltipType,
      color: fill,
      unit: '', // Why does RadialBar not support unit?
    },
  };
}

export class RadialBar extends PureComponent<RadialBarProps, State> {
  static displayName = 'RadialBar';

  static defaultProps = {
    angleAxisId: 0,
    radiusAxisId: 0,
    minPointSize: 0,
    hide: false,
    legendType: 'rect',
    data: [] as RadialBarDataItem[],
    isAnimationActive: !Global.isSsr,
    animationBegin: 0,
    animationDuration: 1500,
    animationEasing: 'ease',
    forceCornerRadius: false,
    cornerIsExternal: false,
  };

  static getComposedData = ({
    item,
    props,
    radiusAxis,
    radiusAxisTicks,
    angleAxis,
    angleAxisTicks,
    displayedData,
    dataKey,
    stackedData,
    barPosition,
    bandSize,
    dataStartIndex,
  }: {
    item: ReactElement;
    props: any;
    radiusAxis: any; // RadiusAxisProps;
    radiusAxisTicks: Array<TickItem>;
    angleAxis: any; // AngleAxisProps;
    angleAxisTicks: Array<TickItem>;
    displayedData: any[];
    dataKey: RadialBarProps['dataKey'];
    stackedData?: any[];
    barPosition?: any[];
    bandSize?: number;
    dataStartIndex: number;
  }): RadialBarComposedData => {
    const pos = findPositionOfBar(barPosition, item);
    if (!pos) {
      return null;
    }

    const { cx, cy } = angleAxis;
    const { layout } = props;
    const { children, minPointSize } = item.props;
    const numericAxis = layout === 'radial' ? angleAxis : radiusAxis;
    const stackedDomain = stackedData ? numericAxis.scale.domain() : null;
    const baseValue = getBaseValueOfBar({ numericAxis });
    const cells = findAllByType(children, Cell);
    const sectors = displayedData.map((entry: any, index: number) => {
      let value, innerRadius, outerRadius, startAngle, endAngle, backgroundSector;

      if (stackedData) {
        value = truncateByDomain(stackedData[dataStartIndex + index], stackedDomain);
      } else {
        value = getValueByDataKey(entry, dataKey);
        if (!Array.isArray(value)) {
          value = [baseValue, value];
        }
      }

      if (layout === 'radial') {
        innerRadius = getCateCoordinateOfBar({
          axis: radiusAxis,
          ticks: radiusAxisTicks,
          bandSize,
          offset: pos.offset,
          entry,
          index,
        });
        endAngle = angleAxis.scale(value[1]);
        startAngle = angleAxis.scale(value[0]);
        outerRadius = innerRadius + pos.size;
        const deltaAngle = endAngle - startAngle;

        if (Math.abs(minPointSize) > 0 && Math.abs(deltaAngle) < Math.abs(minPointSize)) {
          const delta = mathSign(deltaAngle || minPointSize) * (Math.abs(minPointSize) - Math.abs(deltaAngle));

          endAngle += delta;
        }
        backgroundSector = {
          background: {
            cx,
            cy,
            innerRadius,
            outerRadius,
            startAngle: props.startAngle,
            endAngle: props.endAngle,
          },
        };
      } else {
        innerRadius = radiusAxis.scale(value[0]);
        outerRadius = radiusAxis.scale(value[1]);
        startAngle = getCateCoordinateOfBar({
          axis: angleAxis,
          ticks: angleAxisTicks,
          bandSize,
          offset: pos.offset,
          entry,
          index,
        });
        endAngle = startAngle + pos.size;
        const deltaRadius = outerRadius - innerRadius;

        if (Math.abs(minPointSize) > 0 && Math.abs(deltaRadius) < Math.abs(minPointSize)) {
          const delta = mathSign(deltaRadius || minPointSize) * (Math.abs(minPointSize) - Math.abs(deltaRadius));
          outerRadius += delta;
        }
      }

      return {
        ...entry,
        ...backgroundSector,
        payload: entry,
        value: stackedData ? value : value[1],
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        endAngle,
        ...(cells && cells[index] && cells[index].props),
        // @ts-expect-error missing types
        tooltipPayload: [getTooltipItem(item, entry)],
        tooltipPosition: polarToCartesian(cx, cy, (innerRadius + outerRadius) / 2, (startAngle + endAngle) / 2),
      };
    });

    return { data: sectors, layout };
  };

  state: State = {
    isAnimationFinished: false,
  };

  static getDerivedStateFromProps(nextProps: RadialBarProps, prevState: State): State {
    if (nextProps.animationId !== prevState.prevAnimationId) {
      return {
        prevAnimationId: nextProps.animationId,
        curData: nextProps.data,
        prevData: prevState.curData,
      };
    }
    if (nextProps.data !== prevState.curData) {
      return {
        curData: nextProps.data,
      };
    }

    return null;
  }

  handleAnimationEnd = () => {
    const { onAnimationEnd } = this.props;
    this.setState({ isAnimationFinished: true });

    if (isFunction(onAnimationEnd)) {
      onAnimationEnd();
    }
  };

  handleAnimationStart = () => {
    const { onAnimationStart } = this.props;

    this.setState({ isAnimationFinished: false });

    if (isFunction(onAnimationStart)) {
      onAnimationStart();
    }
  };

  renderSectorsStatically(sectors: SectorProps[]) {
    return <RadialBarSectors sectors={sectors} allOtherRadialBarProps={this.props} />;
  }

  renderSectorsWithAnimation() {
    const { data, isAnimationActive, animationBegin, animationDuration, animationEasing, animationId } = this.props;
    const { prevData } = this.state;

    return (
      <Animate
        begin={animationBegin}
        duration={animationDuration}
        isActive={isAnimationActive}
        easing={animationEasing}
        from={{ t: 0 }}
        to={{ t: 1 }}
        key={`radialBar-${animationId}`}
        onAnimationStart={this.handleAnimationStart}
        onAnimationEnd={this.handleAnimationEnd}
      >
        {({ t }: { t: number }) => {
          const stepData = data.map((entry, index) => {
            const prev = prevData && prevData[index];

            if (prev) {
              const interpolatorStartAngle = interpolateNumber(prev.startAngle, entry.startAngle);
              const interpolatorEndAngle = interpolateNumber(prev.endAngle, entry.endAngle);

              return {
                ...entry,
                startAngle: interpolatorStartAngle(t),
                endAngle: interpolatorEndAngle(t),
              };
            }
            const { endAngle, startAngle } = entry;
            const interpolator = interpolateNumber(startAngle, endAngle);

            return { ...entry, endAngle: interpolator(t) };
          });

          return <Layer>{this.renderSectorsStatically(stepData)}</Layer>;
        }}
      </Animate>
    );
  }

  renderSectors() {
    const { data, isAnimationActive } = this.props;
    const { prevData } = this.state;

    if (isAnimationActive && data && data.length && (!prevData || !isEqual(prevData, data))) {
      return this.renderSectorsWithAnimation();
    }

    return this.renderSectorsStatically(data);
  }

  renderBackground(sectors?: RadialBarDataItem[]) {
    const { cornerRadius } = this.props;
    const backgroundProps = filterProps(this.props.background, false);

    return sectors.map((entry, i) => {
      const { value, background, ...rest } = entry;

      if (!background) {
        return null;
      }

      const props: RadialBarSectorProps = {
        cornerRadius: parseCornerRadius(cornerRadius),
        ...rest,
        fill: '#eee',
        ...background,
        ...backgroundProps,
        ...adaptEventsOfChild(this.props, entry, i),
        index: i,
        key: `sector-${i}`,
        className: clsx('recharts-radial-bar-background-sector', backgroundProps?.className),
        option: background,
        isActive: false,
      };

      return <RadialBarSector {...props} />;
    });
  }

  render() {
    const { hide, data, className, background, isAnimationActive } = this.props;

    if (hide || !data || !data.length) {
      // TODO this needs tests - for a while I was missing a `return` here and nothing failed!
      return (
        <>
          <ReportBar />
          <SetRadialBarPayloadLegend data={this.props.data} legendType={this.props.legendType} />
          <SetTooltipEntrySettings fn={getTooltipEntrySettings} args={this.props} />
        </>
      );
    }

    const { isAnimationFinished } = this.state;
    const layerClass = clsx('recharts-area', className);

    return (
      <Layer className={layerClass}>
        <ReportBar />
        <SetRadialBarPayloadLegend data={this.props.data} legendType={this.props.legendType} />
        <SetTooltipEntrySettings fn={getTooltipEntrySettings} args={this.props} />
        {background && <Layer className="recharts-radial-bar-background">{this.renderBackground(data)}</Layer>}

        <Layer className="recharts-radial-bar-sectors">{this.renderSectors()}</Layer>

        {(!isAnimationActive || isAnimationFinished) && LabelList.renderCallByParent({ ...this.props }, data)}
      </Layer>
    );
  }
}
