import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * 판매 상품.
 *
 * 가격을 코드가 아니라 테이블에 두는 이유: 베타 후 가격을 조정할 때 스토어 상품과
 * 이 행만 바꾸면 되고 배포가 필요 없다. 실제 과금은 스토어가 하므로 이 값은
 * **표시·검증용 기준**이다.
 */
@Entity('products')
@Unique('uq_products_sku', ['sku'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 스토어에 등록한 상품 ID (애플·구글 공통으로 맞춘다). */
  @Column({ type: 'varchar' })
  sku: string;

  @Column({ type: 'varchar' })
  name: string;

  /** 원화 표시가. 스토어가 지역별로 다르게 과금하므로 참고값이다. */
  @Column({ name: 'price_krw', type: 'int' })
  priceKrw: number;

  /** 갱신 주기(개월). 애플에는 2주 주기가 없어 1개월로 간다. */
  @Column({ name: 'period_months', type: 'int', default: 1 })
  periodMonths: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
