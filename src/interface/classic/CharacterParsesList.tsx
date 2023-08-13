import { formatNumber, formatPercentage } from 'common/format';
import rankingColor from 'common/getRankingColor';
import { getLabel as getDifficultyLabel } from 'game/DIFFICULTIES';
import GEAR_SLOTS from 'game/GEAR_SLOTS';
import { ItemLink } from 'interface';
import Icon from 'interface/Icon';
import { makePlainUrl } from 'interface/makeAnalyzerUrl';
import { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import { Item } from 'parser/core/Events';

const TRINKET_SLOTS = [GEAR_SLOTS.TRINKET1, GEAR_SLOTS.TRINKET2];

const styles = {
  icon: {
    width: '1.8em',
    height: '1.8em',
    marginRight: 2,
  },
};

export interface Parse {
  name: string;
  spec: string;
  difficulty: number;
  size: number;
  report_code: string;
  report_fight: number;
  historical_percent: number;
  persecondamount: number;
  start_time: number;
  character_name: string;
  gear: Item[];
  advanced: boolean;
}

interface CharacterParsesListProps {
  parses: Parse[];
  class: string;
  metric: string;
}

class CharacterParsesList extends PureComponent<CharacterParsesListProps> {
  constructor(props: CharacterParsesListProps) {
    super(props);
    this.renderItem = this.renderItem.bind(this);
  }

  iconPath(specName: string) {
    return `/specs/${this.props.class.replace(' ', '')}-${specName.replace(' ', '')}.jpg`;
  }

  itemFilter(item: Item, index: number) {
    return TRINKET_SLOTS.includes(index);
  }

  renderItem(item: Item) {
    return (
      <ItemLink key={item.id} id={item.id} className={item.quality.toString()} icon={false}>
        <Icon
          icon={item.icon}
          style={{
            ...styles.icon,
            border: '1px solid',
          }}
        />
      </ItemLink>
    );
  }

  formatPerformance(elem: Parse) {
    const { metric } = this.props;
    return `${formatNumber(elem.persecondamount)} ${metric.toLocaleUpperCase()} (${formatPercentage(
      elem.historical_percent / 100,
      0,
    )}%)`;
  }

  render() {
    const { parses } = this.props;
    return (
      <ul className="list parses-list">
        {parses.map((elem) => {
          const url = makePlainUrl(
            elem.report_code,
            elem.report_fight.toString(),
            elem.difficulty + ' ' + elem.name,
            elem.advanced ? elem.character_name : '',
          );
          return (
            <li key={url}>
              <Link to={url}>
                <div className="row">
                  <div className="col-md-4" style={{ color: 'white' }}>
                    <div>
                      <img className="spec-icon" src={this.iconPath(elem.spec)} alt={elem.spec} />
                      <span className="difficulty">{getDifficultyLabel(elem.difficulty)}</span>
                      <span className="boss">{elem.name}</span>
                    </div>
                  </div>
                  <div className="col-md-2 text-center" style={{ color: 'white' }}>
                    {elem.advanced && elem.size} Player
                  </div>
                  <div className="col-md-2 text-right">
                    <div className={rankingColor(elem.historical_percent / 100)}>
                      {this.formatPerformance(elem)}
                    </div>
                  </div>
                  <div className="col-md-2 text-center">
                    {elem.advanced && elem.gear.filter(this.itemFilter).map(this.renderItem)}
                  </div>
                  <div className="col-md-2" style={{ color: 'white', textAlign: 'right' }}>
                    {new Date(elem.start_time).toLocaleDateString()}
                    {elem.advanced && (
                      <span
                        className="glyphicon glyphicon-chevron-right"
                        aria-hidden="true"
                        style={{ marginLeft: 10 }}
                      />
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
}

export default CharacterParsesList;
